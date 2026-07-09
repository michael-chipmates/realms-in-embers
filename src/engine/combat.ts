/**
 * Battle resolution.
 *
 * One function (`fight`) drives both the real thing and the preview:
 * `resolveBattle` runs it once with the live RNG and applies every
 * consequence to state; `previewBattle` runs it ~240 times on a forked RNG
 * that never advances the real stream — checking your odds never changes them.
 *
 * Every modifier that touches the math is an OddsModifier with a plain-
 * language label. The preview shows exactly what the battle will use.
 */
import { UNITS, vetMult, type UnitDef, type UnitTrait } from './content/units';
import { SPELLS } from './content/spells';
import { TERRAIN } from './content/world';
import { heroDerived } from './heroFx';
import { pickBattleSpell } from './magic';
import { LORD_BY_ID } from './content/lords';
import { grantXp, woundHero } from './heroes';
import { addDeed as heroDeed } from './heroes';
import {
  addDeed, armiesIn, atWar, clamp, creedOf, getStance, lordName, lordOf, removeArmy,
} from './helpers';
import { say } from './narrator';
import { teach } from './teachings';
import { Rng } from './rng';
import type {
  Army, BattleEventNote, BattlePreview, BattleReport, BattleRound, Effect, GameState, Hero,
  OddsModifier, PlayerId, Province, Stance,
} from './types';
import { NEUTRAL } from './types';

// ------------------------------------------------------------ hostilities

export function hostileTo(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return false;
  if (a === NEUTRAL || b === NEUTRAL) return true;
  return atWar(state, a, b);
}

// -------------------------------------------------------------- side setup

interface CUnit {
  type: UnitDef['id'];
  hits: number;
  maxHits: number;
  vet: 0 | 1 | 2;
  traits: UnitTrait[];
  atk: number;
  def: number;
  fromArmy: number;
  index: number;
}

interface CHero {
  id: number;
  name: string;
  epithet: string;
  might: number;
  level: number;
  leadership: number;
  deathSave: number;
  xpMult: number;
}

interface Side {
  player: PlayerId;
  role: 'attacker' | 'defender';
  units: CUnit[];
  heroes: CHero[];
  stance: Stance;
  mods: OddsModifier[];
  /** product of mods */
  mult: number;
  lossHits: number;
  startHits: number;
  /** casualty multiplier on this side (battle spells). */
  lossMult: number;
  /** enemy magic cancels this side's charge/ambush. */
  calmed: boolean;
}

interface FightCtx {
  province: Province;
  riverCrossing: boolean;
  amphibious: boolean;
  wallsWork: boolean;
  wallBonus: number;
}

function unitFromInstance(army: Army, idx: number): CUnit {
  const u = army.units[idx];
  const def = UNITS[u.type];
  return {
    type: u.type,
    hits: u.hits,
    maxHits: def.hits,
    vet: u.vet,
    traits: def.traits,
    atk: def.atk,
    def: def.def,
    fromArmy: army.id,
    index: idx,
  };
}

function buildSide(
  state: GameState,
  armies: Army[],
  role: 'attacker' | 'defender',
  ctx: FightCtx,
  enemyHasTerror: boolean,
  enemyUnits: CUnit[],
): Side {
  const player = armies[0].owner;
  const units = armies.flatMap((a) => a.units.map((_, i) => unitFromInstance(a, i)));
  const heroes: CHero[] = armies.flatMap((a) =>
    a.heroIds
      .map((hid) => state.heroes[hid])
      .filter((hh): hh is Hero => !!hh && hh.status === 'ready')
      .map((hh) => {
        const d = heroDerived(state, hh);
        return {
          id: hh.id, name: hh.name, epithet: hh.epithet,
          might: d.might, level: hh.level, leadership: d.leadership,
          deathSave: d.deathSave, xpMult: d.xpMult,
        };
      }),
  );
  // banner arts: skills/artifacts that lift the whole army
  const arts = armies.flatMap((a) => a.heroIds)
    .map((hid) => state.heroes[hid])
    .filter((hh): hh is Hero => !!hh && hh.status === 'ready')
    .reduce((sum, hh) => sum + heroDerived(state, hh).armyPowerPct, 0);
  const stance: Stance = player === NEUTRAL ? 'bold' : armies[0].stance;
  const mods: OddsModifier[] = [];

  // terrain & walls & mods (defender only)
  if (role === 'defender') {
    const terrainDef = TERRAIN[ctx.province.terrain].defense;
    if (terrainDef !== 1) mods.push({ label: `${TERRAIN[ctx.province.terrain].name} ground`, mult: terrainDef });
    if (ctx.wallBonus > 0) {
      if (ctx.wallsWork) {
        mods.push({ label: wallLabel(ctx.province), mult: 1 + ctx.wallBonus });
      } else {
        mods.push({ label: `${wallLabel(ctx.province)} — leveled by siegeworks`, mult: 1 });
      }
    }
    for (const mod of ctx.province.mods) {
      if (mod.defense) mods.push({ label: mod.label, mult: 1 + mod.defense });
    }
    if (player >= 0) {
      const lord = lordOf(state.players[player]);
      if (ctx.province.owner === player && lord.perk.fx.defendOwnPct) {
        mods.push({ label: lord.perk.label, mult: 1 + lord.perk.fx.defendOwnPct / 100 });
      }
      if (lord.perk.fx.defenseTerrainId === ctx.province.terrain && lord.perk.fx.defenseTerrainPct) {
        mods.push({ label: lord.perk.label, mult: 1 + lord.perk.fx.defenseTerrainPct / 100 });
      }
    }
  }

  // attacker-only situational penalties
  if (role === 'attacker') {
    if (ctx.riverCrossing && !units.every((u) => u.traits.includes('flying'))) {
      mods.push({ label: 'Crossing the river', mult: 0.85 });
    }
    if (ctx.amphibious) {
      mods.push({ label: 'Landing from ships', mult: 0.85 });
    }
  }

  // stance
  if (stance === 'bold') mods.push({ label: 'Bold stance', mult: 1.1 });
  if (stance === 'wary') mods.push({ label: 'Wary stance', mult: 0.88 });

  // leadership
  const lead = heroes.reduce((m, hh) => Math.max(m, hh.leadership), 0);
  if (lead > 0) {
    const bonus = Math.min(0.3, lead * 0.02);
    const best = heroes.reduce((a, b) => (b.leadership >= a.leadership ? b : a));
    mods.push({ label: `${best.name}'s command (+${Math.round(bonus * 100)}%)`, mult: 1 + bonus });
  }

  // battle-casters
  const casters = units.filter((u) => u.traits.includes('caster')).length;
  if (casters > 0) {
    mods.push({ label: `${casters}× Ember Adepts weave battle-light`, mult: 1 + Math.min(0.12, casters * 0.04) });
  }

  // terror
  if (enemyHasTerror) {
    const immune = units.some((u) => u.traits.includes('terror') || u.traits.includes('unyielding'));
    if (!immune) mods.push({ label: 'Terror in the ranks', mult: 0.92 });
  }

  // creed grudge perks (atkVsCreed) are appended by the caller via
  // addCreedGrudgeMod — it needs the enemy lord's creed, unknown here.

  if (arts > 0) {
    mods.push({ label: 'Banner arts of the heroes', mult: 1 + arts / 100 });
  }

  const mult = mods.reduce((m, x) => m * x.mult, 1);
  const startHits = units.reduce((n, u) => n + u.hits, 0);
  return { player, role, units, heroes, stance, mods, mult, lossHits: 0, startHits, lossMult: 1, calmed: false };
}

function wallLabel(p: Province): string {
  if (p.buildings.includes('walls3')) return 'High Keep (+50%)';
  if (p.buildings.includes('walls2')) return 'Stone Walls (+35%)';
  return 'Palisade (+20%)';
}

function wallBonusOf(p: Province): number {
  if (p.buildings.includes('walls3')) return 0.5;
  if (p.buildings.includes('walls2')) return 0.35;
  if (p.buildings.includes('walls1')) return 0.2;
  return 0;
}

// ------------------------------------------------------------------ power

function unitContribution(u: CUnit, side: Side, round: number, ctx: FightCtx, enemyBraces: boolean): number {
  if (u.hits <= 0) return 0;
  const roleAtk = side.role === 'attacker' ? u.atk * 0.65 + u.def * 0.35 : u.atk * 0.35 + u.def * 0.65;
  let mult = vetMult(u.vet) * (u.hits / u.maxHits);
  const t = ctx.province.terrain;
  if (u.traits.includes('forestborn') && t === 'forest') mult *= 1.25;
  if (u.traits.includes('mountainborn') && t === 'mountain') mult *= 1.25;
  if (u.traits.includes('marshborn') && t === 'moor') mult *= 1.25;
  if (u.traits.includes('flying')) mult *= 1.1;
  if (u.traits.includes('ragged')) mult *= 0.9;
  if (round === 1 && !side.calmed) {
    const open = t === 'meadow' || t === 'hills';
    if (u.traits.includes('charge') && open && !enemyBraces) mult *= 1.2;
    if (u.traits.includes('ambush') && side.role === 'attacker') mult *= 1.25;
  }
  if (u.traits.includes('brace') && side.role === 'defender') mult *= 1.1;
  return roleAtk * mult;
}

function sidePower(side: Side, enemy: Side, round: number, ctx: FightCtx): number {
  const enemyBraces = enemy.units.some((u) => u.hits > 0 && u.traits.includes('brace'));
  let power = 0;
  for (const u of side.units) power += unitContribution(u, side, round, ctx, enemyBraces);
  for (const hh of side.heroes) power += hh.might * (2 + hh.level * 0.45);
  return power * side.mult;
}

function rangedPower(side: Side, enemy: Side, ctx: FightCtx): number {
  const enemyBraces = false;
  let power = 0;
  for (const u of side.units) {
    if (u.traits.includes('ranged')) power += unitContribution(u, side, 0, ctx, enemyBraces);
  }
  return power * side.mult;
}

// ------------------------------------------------------------------ fight

const DMG = 0.135;

interface FightResult {
  winner: 'attacker' | 'defender';
  rounds: BattleRound[];
  notes: BattleEventNote[];
  withdrew: 'attacker' | 'defender' | null;
  routed: 'attacker' | 'defender' | null;
}

function dealDamage(rng: Rng, target: Side, rawHits: number): number {
  rawHits *= target.lossMult;
  let toDeal = Math.floor(rawHits) + (rng.chance(rawHits % 1) ? 1 : 0);
  let dealt = 0;
  while (toDeal > 0) {
    const alive = target.units.filter((u) => u.hits > 0);
    if (alive.length === 0) break;
    const pick = rng.pickWeighted(alive, (u) => u.hits);
    if (pick.traits.includes('armored') && rng.chance(0.15)) {
      toDeal--;
      continue; // turned by armor
    }
    pick.hits--;
    target.lossHits++;
    dealt++;
    toDeal--;
  }
  return dealt;
}

function fight(rng: Rng, attacker: Side, defender: Side, ctx: FightCtx): FightResult {
  const rounds: BattleRound[] = [];
  const notes: BattleEventNote[] = [];
  let withdrew: FightResult['withdrew'] = null;
  let routed: FightResult['routed'] = null;

  // archery prelude
  const aRanged = rangedPower(attacker, defender, ctx);
  const dRanged = rangedPower(defender, attacker, ctx);
  if (aRanged > 0 || dRanged > 0) {
    const aLoss = dealDamage(rng, attacker, dRanged * DMG * 0.6 * rng.range(0.85, 1.15));
    const dLoss = dealDamage(rng, defender, aRanged * DMG * 0.6 * rng.range(0.85, 1.15));
    rounds.push({
      aPower: Math.round(aRanged), dPower: Math.round(dRanged), aLoss, dLoss,
      notes: ['Arrow-storm before the lines meet.'],
    });
  }

  const alive = (s: Side) => s.units.some((u) => u.hits > 0);

  for (let round = 1; round <= 7; round++) {
    if (!alive(attacker) || !alive(defender)) break;
    const aPow = sidePower(attacker, defender, round, ctx);
    const dPow = sidePower(defender, attacker, round, ctx);
    const roundNotes: string[] = [];
    if (round === 1) {
      const open = ctx.province.terrain === 'meadow' || ctx.province.terrain === 'hills';
      const aCharge = attacker.units.some((u) => u.hits > 0 && u.traits.includes('charge'));
      const dBrace = defender.units.some((u) => u.hits > 0 && u.traits.includes('brace'));
      if (aCharge && open && dBrace) roundNotes.push('The charge shatters on braced spears.');
      else if (aCharge && open) roundNotes.push('Cavalry strikes home at the first shock.');
      if (attacker.units.some((u) => u.traits.includes('ambush'))) roundNotes.push('The first blow comes from nowhere.');
    }
    const aLoss = dealDamage(rng, attacker, dPow * DMG * rng.range(0.85, 1.15));
    const dLoss = dealDamage(rng, defender, aPow * DMG * rng.range(0.85, 1.15));
    rounds.push({ aPower: Math.round(aPow), dPower: Math.round(dPow), aLoss, dLoss, notes: roundNotes });

    if (!alive(attacker) || !alive(defender)) break;

    // withdrawal checks from round 2 (neutral defenders never yield)
    if (round >= 2) {
      const aPow2 = sidePower(attacker, defender, round + 1, ctx);
      const dPow2 = sidePower(defender, attacker, round + 1, ctx);
      const check = (side: Side, own: number, other: number): boolean => {
        if (side.player === NEUTRAL) return false;
        if (side.units.every((u) => u.hits <= 0 || u.traits.includes('unyielding'))) return false;
        const threshold = side.stance === 'wary' ? 0.8 : side.stance === 'measured' ? 0.5 : 0.28;
        return own < other * threshold;
      };
      if (check(attacker, aPow2, dPow2)) {
        withdrew = 'attacker';
        dealDamage(rng, attacker, dPow2 * DMG * 0.5);
        notes.push({ kind: 'withdraw', text: 'The attackers broke off and fell back in order — mostly.' });
        break;
      }
      if (check(defender, dPow2, aPow2)) {
        withdrew = 'defender';
        dealDamage(rng, defender, aPow2 * DMG * 0.5);
        notes.push({ kind: 'withdraw', text: 'The defenders yielded the field, saving what could be saved.' });
        break;
      }
    }
  }

  let winner: 'attacker' | 'defender';
  if (withdrew) {
    winner = withdrew === 'attacker' ? 'defender' : 'attacker';
  } else if (!alive(defender) && alive(attacker)) {
    winner = 'attacker';
  } else if (!alive(attacker) && alive(defender)) {
    winner = 'defender';
  } else {
    // both stand after 7 rounds: defender holds the field
    winner = 'defender';
    if (alive(attacker)) notes.push({ kind: 'lastStand', text: 'Night ended the argument; the field stayed with its keepers.' });
  }

  // rout: catastrophic collapse of the loser
  const loser = winner === 'attacker' ? defender : attacker;
  if (!withdrew && loser.units.every((u) => u.hits <= 0)) {
    routed = winner === 'attacker' ? 'defender' : 'attacker';
  }

  return { winner, rounds, notes, withdrew, routed };
}

// -------------------------------------------------------------- ctx setup

function makeCtx(state: GameState, fromProvince: number, target: Province, viaSea: boolean, attackerArmies: Army[], defenders: Army[]): FightCtx {
  const from = state.provinces[fromProvince];
  const riverCrossing = from.riverBorders.includes(target.id);
  const defenderOwnsProvince = defenders.some((d) => d.owner === target.owner);
  const wallBonus = defenderOwnsProvince ? wallBonusOf(target) : 0;
  const attackerHasSiege = attackerArmies.some((a) => a.units.some((u) => UNITS[u.type].traits.includes('siege')));
  return {
    province: target,
    riverCrossing,
    amphibious: viaSea,
    wallsWork: !attackerHasSiege,
    wallBonus,
  };
}

function addCreedGrudgeMod(state: GameState, side: Side, enemyPlayer: PlayerId): void {
  if (side.player < 0 || enemyPlayer < 0) return;
  const lord = lordOf(state.players[side.player]);
  const fx = lord.perk.fx;
  if (fx.atkVsCreed && fx.atkVsCreedPct && creedOf(state.players[enemyPlayer]) === fx.atkVsCreed) {
    const mod = { label: `${lord.perk.label} (against the ${fx.atkVsCreed === 'umbra' ? 'Umbra' : fx.atkVsCreed === 'flame' ? 'Flame' : 'Ash'})`, mult: 1 + fx.atkVsCreedPct / 100 };
    side.mods.push(mod);
    side.mult *= mod.mult;
  }
}

/** Battle magic: each side auto-weaves its strongest affordable spell. */
function weaveSpells(
  state: GameState,
  aSide: Side,
  dSide: Side,
  aArmies: Army[],
  dArmies: Army[],
  spend: boolean,
  notes?: BattleEventNote[],
): void {
  const pairs: [Side, Side, Army[]][] = [
    [aSide, dSide, aArmies],
    [dSide, aSide, dArmies],
  ];
  for (const [side, other, armies] of pairs) {
    if (side.player < 0) continue;
    const woven = pickBattleSpell(state, side.player, armies);
    if (!woven) continue;
    const def = SPELLS[woven.spell];
    const fx = def.battle;
    if (!fx) continue;
    if (fx.powerMult && fx.powerMult !== 1) {
      side.mods.push({ label: `${def.name} (−${woven.cost} Emberlight)`, mult: fx.powerMult });
      side.mult *= fx.powerMult;
    }
    if (fx.enemyMult && fx.enemyMult !== 1) {
      other.mods.push({ label: `${def.name} against them (−${woven.cost} Emberlight)`, mult: fx.enemyMult });
      other.mult *= fx.enemyMult;
      if (!fx.powerMult) side.mods.push({ label: `${def.name} (−${woven.cost} Emberlight) — weakens the foe`, mult: 1 });
    }
    if (fx.lossMult && fx.lossMult !== 1) {
      side.lossMult *= fx.lossMult;
      side.mods.push({ label: `${def.name} (−${woven.cost} Emberlight) — shields the ranks`, mult: 1 });
    }
    if (fx.calmGround) {
      other.calmed = true;
    }
    if (spend) {
      state.players[side.player].emberlight = Math.max(0, state.players[side.player].emberlight - woven.cost);
      notes?.push({ kind: 'spell', text: `${def.name} was woven over the field by ${side.role === 'attacker' ? 'the attackers' : 'the defenders'}.` });
    }
  }
}

// ----------------------------------------------------------------- preview

export function previewBattle(state: GameState, armyId: number, targetProvince: number, viaSea = false, runs = 240): BattlePreview | null {
  const army = state.armies[armyId];
  if (!army) return null;
  const target = state.provinces[targetProvince];
  const defenders = armiesIn(state, targetProvince).filter((a) => hostileTo(state, army.owner, a.owner));
  if (defenders.length === 0) return null;

  const rng = new Rng(state.rng).fork(`preview-${armyId}-${targetProvince}-${state.turn}`);
  let wins = 0;
  let aLossSum = 0;
  let dLossSum = 0;
  let sample: { aMods: OddsModifier[]; dMods: OddsModifier[]; aStr: number; dStr: number } | null = null;

  for (let i = 0; i < runs; i++) {
    const ctx = makeCtx(state, army.province, target, viaSea, [army], defenders);
    const enemyTerrorA = defenders.some((d) => d.units.some((u) => UNITS[u.type].traits.includes('terror')));
    const attackerTerror = army.units.some((u) => UNITS[u.type].traits.includes('terror'));
    const aSide = buildSide(state, [army], 'attacker', ctx, enemyTerrorA, []);
    const dSide = buildSide(state, defenders, 'defender', ctx, attackerTerror, []);
    addCreedGrudgeMod(state, aSide, dSide.player);
    addCreedGrudgeMod(state, dSide, aSide.player);
    weaveSpells(state, aSide, dSide, [army], defenders, false);
    if (!sample) {
      sample = {
        aMods: aSide.mods,
        dMods: dSide.mods,
        aStr: Math.round(sidePower(aSide, dSide, 2, ctx)),
        dStr: Math.round(sidePower(dSide, aSide, 2, ctx)),
      };
    }
    const result = fight(rng, aSide, dSide, ctx);
    if (result.winner === 'attacker') wins++;
    aLossSum += aSide.lossHits / Math.max(1, aSide.startHits);
    dLossSum += dSide.lossHits / Math.max(1, dSide.startHits);
  }

  const notes: string[] = [];
  const wallBonus = wallBonusOf(target);
  if (wallBonus > 0 && defenders.some((d) => d.owner === target.owner)) {
    const hasSiege = army.units.some((u) => UNITS[u.type].traits.includes('siege'));
    notes.push(hasSiege ? 'Your siegeworks will level the walls.' : 'Walls stand against you — siegeworks would level them.');
  }
  if (state.provinces[army.province].riverBorders.includes(target.id)) notes.push('You attack across a river (−15%).');
  if (viaSea) notes.push('An assault from the sea (−15%).');
  const heroCount = army.heroIds.filter((h) => state.heroes[h]?.status === 'ready').length;
  if (heroCount > 0) notes.push(heroCount === 1 ? 'Your hero risks wounds or death if the day goes ill.' : 'Your heroes risk wounds or death if the day goes ill.');

  return {
    winChance: wins / runs,
    aStrength: sample?.aStr ?? 0,
    dStrength: sample?.dStr ?? 0,
    aExpectedLoss: aLossSum / runs,
    dExpectedLoss: dLossSum / runs,
    aMods: sample?.aMods ?? [],
    dMods: sample?.dMods ?? [],
    notes,
  };
}

// ------------------------------------------------------------ resolution

export interface BattleOutcome {
  report: BattleReport;
  effects: Effect[];
  attackerWon: boolean;
}

export function resolveBattle(
  state: GameState,
  rng: Rng,
  armyId: number,
  targetProvince: number,
  viaSea: boolean,
  fromProvince: number,
): BattleOutcome {
  const army = state.armies[armyId];
  const target = state.provinces[targetProvince];
  const defenders = armiesIn(state, targetProvince).filter((a) => hostileTo(state, army.owner, a.owner));
  const effects: Effect[] = [];

  const ctx = makeCtx(state, fromProvince, target, viaSea, [army], defenders);
  const defTerror = defenders.some((d) => d.units.some((u) => UNITS[u.type].traits.includes('terror')));
  const atkTerror = army.units.some((u) => UNITS[u.type].traits.includes('terror'));
  const aSide = buildSide(state, [army], 'attacker', ctx, defTerror, []);
  const dSide = buildSide(state, defenders, 'defender', ctx, atkTerror, []);
  addCreedGrudgeMod(state, aSide, dSide.player);
  addCreedGrudgeMod(state, dSide, aSide.player);
  const spellNotes: BattleEventNote[] = [];
  weaveSpells(state, aSide, dSide, [army], defenders, true, spellNotes);

  const beforeUnitsA = summarizeUnits(aSide);
  const beforeUnitsD = summarizeUnits(dSide);

  const result = fight(rng, aSide, dSide, ctx);

  // ---- write casualties back to real armies
  applyCasualties(state, aSide);
  applyCasualties(state, dSide);

  // ---- hero fates
  const heroNotes: BattleEventNote[] = [];
  const heroFates = (side: Side, won: boolean) => {
    for (const ch of side.heroes) {
      const hero = state.heroes[ch.id];
      if (!hero || hero.status === 'dead') continue;
      const cf = side.lossHits / Math.max(1, side.startHits);
      let risk = (won ? 0.05 : 0.16) * (0.5 + cf);
      if (hero.cls === 'champion') risk += 0.02;
      if (rng.chance(clamp(risk, 0, 0.5))) {
        if (rng.chance(Math.max(0.05, 0.35 - ch.deathSave))) {
          heroDies(state, rng, hero, `in the battle for ${target.name}`, effects, heroNotes);
        } else {
          const turns = rng.intRange(2, 3);
          woundHero(hero, turns);
          detachHero(state, hero);
          hero.province = homeProvince(state, hero.owner);
          heroNotes.push({ kind: 'heroWound', text: `${hero.name} was carried from the field, bloodied but breathing. (${turns} seasons to mend.)` });
        }
      } else if (!won ? rng.chance(0.2) : rng.chance(0.35)) {
        heroDeed(hero, won ? `Held the field at ${target.name}` : `Survived the defeat at ${target.name}`);
      }
    }
  };
  const attackerWon = result.winner === 'attacker';
  heroFates(aSide, attackerWon);
  heroFates(dSide, !attackerWon);

  // ---- xp
  const xpFor = (side: Side, enemy: Side, won: boolean) => {
    const defeated = enemy.lossHits * 3;
    const share = Math.max(1, side.heroes.length);
    for (const ch of side.heroes) {
      const hero = state.heroes[ch.id];
      if (!hero || hero.status === 'dead') continue;
      const gained = grantXp(hero, rng, ((defeated * (won ? 1 : 0.45)) / share + (won ? 12 : 4)) * ch.xpMult);
      if (gained > 0) {
        effects.push({ e: 'heroLevel', heroId: hero.id, level: hero.level });
        if (hero.levelChoices.length > 0) teach(state, hero.owner, 'firstHeroLevel');
      }
    }
  };
  xpFor(aSide, dSide, attackerWon);
  xpFor(dSide, aSide, !attackerWon);

  // ---- veterancy for surviving winners
  const winnerArmies = attackerWon ? [army] : defenders;
  for (const wa of winnerArmies) {
    for (const u of wa.units) {
      if (u.hits > 0 && u.vet < 2 && rng.chance(0.3)) u.vet = (u.vet + 1) as 1 | 2;
    }
  }

  // ---- retreat / destruction of the loser
  if (attackerWon) {
    for (const d of defenders) retreatOrDisband(state, rng, d, effects);
  } else {
    if (result.withdrew === 'attacker' || army.units.some((u) => u.hits > 0)) {
      // fall back to origin if it's still ours; otherwise disperse
      pruneDead(army);
      const origin = state.provinces[fromProvince];
      if (army.units.length > 0 && origin.owner === army.owner) {
        army.province = fromProvince;
        army.moved = true;
      } else {
        disbandInto(state, rng, army, effects);
      }
    } else {
      disbandInto(state, rng, army, effects);
    }
  }
  pruneDead(army);
  for (const d of defenders) pruneDead(d);
  cleanupEmptyArmies(state, [army.id, ...defenders.map((d) => d.id)]);

  // ---- capture
  let captured = false;
  const attacker = army.owner;
  if (attackerWon && state.armies[army.id]) {
    army.province = target.id;
    army.moved = true;
    const previousOwner = target.owner;
    const canTake = previousOwner === NEUTRAL || hostileTo(state, attacker, previousOwner);
    if (canTake) {
      captured = true;
      captureProvince(state, rng, target, attacker, effects);
    }
  }

  // ---- plunder perks
  if (attackerWon && attacker >= 0) {
    plunder(state, attacker, effects);
  } else if (!attackerWon && dSide.player >= 0) {
    plunder(state, dSide.player, effects);
  }

  // ---- report
  const report: BattleReport = {
    id: state.nextBattleId++,
    turn: state.turn,
    province: target.id,
    provinceName: target.name,
    attacker: finishSummary(beforeUnitsA, aSide, state),
    defender: finishSummary(beforeUnitsD, dSide, state),
    rounds: result.rounds,
    events: [...spellNotes, ...result.notes, ...heroNotes],
    winner: result.winner,
    captured,
    aMods: aSide.mods,
    dMods: dSide.mods,
  };
  state.battles.push(report);
  if (state.battles.length > 16) state.battles.shift();
  effects.unshift({ e: 'battle', report });

  // ---- chronicle
  const scale = scaleText(aSide.lossHits + dSide.lossHits);
  if (dSide.player === NEUTRAL && attackerWon) {
    // captureProvince already narrates the taking of free provinces
  } else if (dSide.player === NEUTRAL || aSide.player === NEUTRAL) {
    // skirmishes with rebels/marauders get narrated by their systems
  } else {
    say(state, rng, 'fieldBattle', {
      winner: lordName(state, attackerWon ? aSide.player : dSide.player),
      loser: lordName(state, attackerWon ? dSide.player : aSide.player),
      province: target.name,
      scale,
    }, { about: attackerWon ? aSide.player : dSide.player });
  }

  // ---- the chronicler teaches on firsts
  if (attackerWon && aSide.player >= 0) teach(state, aSide.player, 'firstBattleWon');
  else if (!attackerWon && dSide.player >= 0) teach(state, dSide.player, 'firstBattleWon');
  if (attackerWon && dSide.player >= 0) teach(state, dSide.player, 'firstBattleLost');
  else if (!attackerWon && aSide.player >= 0) teach(state, aSide.player, 'firstBattleLost');

  // ---- diplomacy memory: fighting someone is remembered
  if (aSide.player >= 0 && dSide.player >= 0) {
    addDeed(state, dSide.player, aSide.player, { id: 'attacked', label: `Attacked us at ${target.name}`, delta: -12, decay: 1 });
  }

  return { report, effects, attackerWon };
}

// ----------------------------------------------------- consequence helpers

function summarizeUnits(side: Side): { type: (typeof UNITS)[keyof typeof UNITS]['id']; count: number }[] {
  const counts = new Map<string, number>();
  for (const u of side.units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type: type as CUnit['type'], count }));
}

function finishSummary(
  before: { type: CUnit['type']; count: number }[],
  side: Side,
  state: GameState,
): BattleReport['attacker'] {
  const aliveCounts = new Map<string, number>();
  for (const u of side.units) {
    if (u.hits > 0) aliveCounts.set(u.type, (aliveCounts.get(u.type) ?? 0) + 1);
  }
  return {
    player: side.player,
    strength: side.startHits,
    units: before.map((b) => ({ type: b.type, count: b.count, lost: b.count - (aliveCounts.get(b.type) ?? 0) })),
    heroNames: side.heroes.map((hh) => `${hh.name}, ${hh.epithet}`),
  };
}

function applyCasualties(state: GameState, side: Side): void {
  for (const cu of side.units) {
    const army = state.armies[cu.fromArmy];
    if (!army) continue;
    const inst = army.units[cu.index];
    if (inst && inst.type === cu.type) inst.hits = cu.hits;
  }
}

function pruneDead(army: Army): void {
  army.units = army.units.filter((u) => u.hits > 0);
}

function cleanupEmptyArmies(state: GameState, ids: number[]): void {
  for (const id of ids) {
    const army = state.armies[id];
    if (army && army.units.length === 0) {
      removeArmy(state, id);
    }
  }
}

function detachHero(state: GameState, hero: Hero): void {
  if (hero.armyId !== null) {
    const army = state.armies[hero.armyId];
    if (army) army.heroIds = army.heroIds.filter((h) => h !== hero.id);
    hero.armyId = null;
  }
}

function homeProvince(state: GameState, pid: PlayerId): number {
  if (pid >= 0) {
    const seat = state.provinces[state.players[pid].seatProvince];
    if (seat.owner === pid) return seat.id;
    const any = state.provinces.find((p) => p.owner === pid);
    if (any) return any.id;
  }
  return 0;
}

export function heroDies(
  state: GameState,
  rng: Rng,
  hero: Hero,
  cause: string,
  effects: Effect[],
  notes?: BattleEventNote[],
): void {
  hero.status = 'dead';
  hero.diedTurn = state.turn;
  hero.deathCause = cause;
  detachHero(state, hero);
  // artifacts fall to the realm's vault
  if (hero.owner >= 0) {
    const vault = state.players[hero.owner].vault;
    for (const slot of ['weapon', 'armor', 'trinket'] as const) {
      const art = hero.artifacts[slot];
      if (art !== null) {
        vault.push(art);
        hero.artifacts[slot] = null;
      }
    }
  }
  effects.push({ e: 'heroDied', heroId: hero.id, name: hero.name, cause, owner: hero.owner });
  notes?.push({ kind: 'heroDeath', text: `${hero.name}, ${hero.epithet}, fell — ${cause}.` });
  if (hero.owner >= 0) {
    say(state, rng, 'heroDied', {
      hero: hero.name,
      epithet: hero.epithet,
      cause,
      lord: lordName(state, hero.owner),
    }, { about: hero.owner });
  }
}

function retreatOrDisband(state: GameState, rng: Rng, army: Army, effects: Effect[]): void {
  pruneDead(army);
  if (!state.armies[army.id]) return;
  if (army.units.length === 0) {
    disbandInto(state, rng, army, effects);
    return;
  }
  if (army.owner === NEUTRAL) {
    // neutrals fight to the last; survivors scatter
    removeArmy(state, army.id);
    return;
  }
  const from = state.provinces[army.province];
  const safe = from.neighbors.find(
    (n) =>
      state.provinces[n].owner === army.owner &&
      !armiesIn(state, n).some((a) => hostileTo(state, army.owner, a.owner)),
  );
  if (safe !== undefined) {
    army.province = safe;
    army.moved = true;
  } else {
    disbandInto(state, rng, army, effects);
  }
}

/** Army ends: units lost; heroes each try to slip away home, wounded. */
function disbandInto(state: GameState, rng: Rng, army: Army, effects: Effect[]): void {
  for (const hid of [...army.heroIds]) {
    const hero = state.heroes[hid];
    if (!hero || hero.status === 'dead') continue;
    detachHero(state, hero);
    if (rng.chance(0.75)) {
      woundHero(hero, rng.intRange(2, 4));
      hero.province = homeProvince(state, hero.owner);
    } else {
      heroDies(state, rng, hero, 'cut down covering the retreat', effects);
    }
  }
  removeArmy(state, army.id);
}

export function captureProvince(
  state: GameState,
  rng: Rng,
  province: Province,
  newOwner: PlayerId,
  effects: Effect[],
): void {
  const previous = province.owner;
  province.owner = newOwner;
  province.capturedTurn = state.turn;
  province.order = Math.min(province.order, 38);
  province.buildQueue = null;
  province.recruitQueue = null;
  effects.push({ e: 'captured', province: province.id, by: newOwner, from: previous });

  // seeing is believing
  if (newOwner >= 0) {
    const seen = state.players[newOwner].seen;
    if (!seen.includes(province.id)) seen.push(province.id);
    for (const n of province.neighbors) if (!seen.includes(n)) seen.push(n);
  }

  if (previous >= 0) {
    addDeed(state, previous, newOwner, { id: 'tookProvince', label: `Took ${province.name} from us`, delta: -18, decay: 1 });
    // other lords watch conquest with narrowed eyes
    for (const p of state.players) {
      if (p.id !== newOwner && p.id !== previous && p.alive) {
        addDeed(state, p.id, newOwner, { id: 'conqueror', label: 'Grows by conquest', delta: -4, decay: 1.5 });
      }
    }
  }

  if (newOwner >= 0) {
    teach(state, newOwner, 'firstCapture');
    if (previous === NEUTRAL) {
      say(state, rng, 'captureNeutral', { lord: lordName(state, newOwner), province: province.name }, { about: newOwner });
    } else if (province.seatOf === previous) {
      say(state, rng, 'captureSeat', {
        lord: lordName(state, newOwner),
        loser: lordName(state, previous),
        province: province.name,
      }, { about: newOwner });
    } else if (previous >= 0) {
      say(state, rng, 'captureEnemy', {
        lord: lordName(state, newOwner),
        loser: lordName(state, previous),
        province: province.name,
      }, { about: newOwner });
    }
  }

  // elimination check for the previous owner
  if (previous >= 0) {
    const remaining = state.provinces.filter((p) => p.owner === previous).length;
    if (remaining === 0) {
      eliminatePlayer(state, rng, previous, newOwner >= 0 ? lordName(state, newOwner) : 'the leaderless', effects);
    }
  }
}

export function eliminatePlayer(state: GameState, rng: Rng, pid: PlayerId, by: string, effects: Effect[]): void {
  const player = state.players[pid];
  if (!player.alive) return;
  player.alive = false;
  player.eliminatedTurn = state.turn;
  // armies scatter into rebel bands; heroes vanish from the story
  for (const army of Object.values(state.armies)) {
    if (army.owner === pid) {
      army.owner = NEUTRAL;
      army.kind = 'rebels';
      army.stance = 'bold';
      for (const hid of [...army.heroIds]) {
        const hero = state.heroes[hid];
        if (hero) {
          hero.status = 'dead';
          hero.diedTurn = state.turn;
          hero.deathCause = 'lost with the fall of their banner';
          army.heroIds = army.heroIds.filter((h) => h !== hid);
          hero.armyId = null;
        }
      }
    }
  }
  for (const hero of Object.values(state.heroes)) {
    if (hero.owner === pid && hero.status !== 'dead') {
      hero.status = 'dead';
      hero.diedTurn = state.turn;
      hero.deathCause = 'passed out of the chronicle when the banner fell';
    }
  }
  effects.push({ e: 'eliminated', player: pid });
  say(state, rng, 'eliminated', { lord: lordName(state, pid), conqueror: by }, { about: pid });
  say(state, rng, 'lordSpeech', {
    lord: lordName(state, pid),
    quote: lordOf(state.players[pid]).lines.defeat,
  }, { about: pid });
}

function plunder(state: GameState, pid: PlayerId, effects: Effect[]): void {
  void effects;
  const player = state.players[pid];
  let gold = 0;
  if (creedOf(player) === 'umbra') gold += 10;
  const fx = lordOf(player).perk.fx;
  if (fx.plunderWinGold) gold += fx.plunderWinGold;
  player.gold += gold;
}

function scaleText(totalHits: number): string {
  if (totalHits <= 6) return 'a skirmish, as such things go';
  if (totalHits <= 14) return 'a sharp and bloody afternoon';
  if (totalHits <= 26) return 'a full day of slaughter';
  return 'a battle the balladeers will argue about for a generation';
}
