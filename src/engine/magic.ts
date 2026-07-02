/**
 * Emberlight in practice: Rites (learning), realm spells (cast from the war
 * table), and battle spells (auto-woven wherever a side fields casters —
 * always shown in the odds preview, never a surprise).
 */
import { RITE_LEARNABLE, SPELLS, spellCostFor as rawCost } from './content/spells';
import { UNITS } from './content/units';
import { heroDerived } from './heroFx';
import { armiesIn, clamp, heroesOf, lordOf, lordName, makeUnits, newArmy, provincesOf } from './helpers';
import { say, scribe } from './narrator';
import { teach } from './teachings';
import type { Rng } from './rng';
import type { Army, Effect, GameState, PlayerId, SpellId } from './types';
import { creedAffinity } from './content/world';

// ------------------------------------------------------------------ costs

export function spellDiscountFor(state: GameState, pid: PlayerId): number {
  const lord = lordOf(state.players[pid]);
  let best = lord.perk.fx.spellDiscountPct ?? 0;
  for (const hero of heroesOf(state, pid)) {
    if (hero.status === 'dead') continue;
    best = Math.max(best, heroDerived(state, hero).spellDiscountPct);
  }
  return best;
}

export function spellCostFor(state: GameState, pid: PlayerId, id: SpellId): number {
  const lord = lordOf(state.players[pid]);
  return rawCost(spellDiscountFor(state, pid), lord.perk.fx.discordDiscountPct ?? 0, id);
}

/** Rite cost, cheapened by standing-stone circles you rule (−15% each, max 2). */
export function riteCostFor(state: GameState, pid: PlayerId, id: SpellId): number {
  const circles = Math.min(2, provincesOf(state, pid).filter((p) => p.site === 'circle').length);
  return Math.max(8, Math.round(SPELLS[id].riteCost * (1 - circles * 0.15)));
}

// ------------------------------------------------------------------ rites

export function refreshRiteOffers(state: GameState, rng: Rng, pid: PlayerId): void {
  const player = state.players[pid];
  const known = new Set(player.spells);
  const pool = RITE_LEARNABLE.filter((id) => !known.has(id));
  if (pool.length === 0) {
    player.riteOffers = [];
    return;
  }
  const creed = lordOf(player).creed;
  const picks: SpellId[] = [];
  const working = [...pool];
  while (picks.length < Math.min(3, pool.length) && working.length > 0) {
    const pick = rng.pickWeighted(working, (id) => {
      const def = SPELLS[id];
      let w = 2;
      if (def.creedAffinity === creed) w += 2.5;
      else if (def.creedAffinity && creedAffinity(creed, def.creedAffinity) < -10) w -= 1.2;
      return Math.max(0.3, w);
    });
    picks.push(pick);
    working.splice(working.indexOf(pick), 1);
  }
  player.riteOffers = picks;
}

export function completeRite(state: GameState, rng: Rng, pid: PlayerId, effects: Effect[]): void {
  const player = state.players[pid];
  if (!player.rite) return;
  const spell = player.rite.spellId;
  player.spells.push(spell);
  player.rite = null;
  refreshRiteOffers(state, rng, pid);
  effects.push({ e: 'riteComplete', spell, by: pid });
  teach(state, pid, 'firstSpellKnown');
  say(state, rng, 'riteComplete', {
    lord: lordName(state, pid),
    spell: SPELLS[spell].name,
    kind: SPELLS[spell].kind === 'battle' ? 'a working of war' : 'a working of the realm',
  }, { about: pid });
}

// ----------------------------------------------------------- battle magic

export interface WovenSpell {
  spell: SpellId;
  cost: number;
}

/** How many casters an army set brings (adept companies + magus heroes). */
export function casterWeight(state: GameState, armies: Army[]): number {
  let n = 0;
  for (const army of armies) {
    for (const u of army.units) if (UNITS[u.type].traits.includes('caster')) n++;
    for (const hid of army.heroIds) {
      const hero = state.heroes[hid];
      if (hero && hero.status === 'ready' && hero.cls === 'magus') n += 2;
    }
  }
  return n;
}

/** The battle spell a side will weave: strongest affordable, or null. */
export function pickBattleSpell(state: GameState, pid: PlayerId, armies: Army[]): WovenSpell | null {
  if (pid < 0) return null;
  if (casterWeight(state, armies) === 0) return null;
  const player = state.players[pid];
  const known = player.spells.filter((id) => SPELLS[id].kind === 'battle');
  // magus heroes marching here contribute their personal spells
  for (const army of armies) {
    for (const hid of army.heroIds) {
      const hero = state.heroes[hid];
      if (hero && hero.status === 'ready') {
        for (const s of hero.spells) {
          if (SPELLS[s].kind === 'battle' && !known.includes(s)) known.push(s);
        }
      }
    }
  }
  if (known.length === 0) return null;
  let best: WovenSpell | null = null;
  let bestPower = 0;
  for (const id of known) {
    const cost = spellCostFor(state, pid, id);
    if (cost > player.emberlight) continue;
    const fx = SPELLS[id].battle;
    if (!fx) continue;
    const power = (fx.powerMult ?? 1) / (fx.enemyMult ?? 1) + (1 - (fx.lossMult ?? 1)) * 0.8 + (fx.calmGround ? 0.08 : 0);
    if (power > bestPower) {
      bestPower = power;
      best = { spell: id, cost };
    }
  }
  return best;
}

// ------------------------------------------------------------ realm magic

export interface CastResult {
  ok: boolean;
  error?: string;
}

export function castRealmSpell(
  state: GameState,
  rng: Rng,
  pid: PlayerId,
  spellId: SpellId,
  provinceId: number | undefined,
  effects: Effect[],
): CastResult {
  const player = state.players[pid];
  const def = SPELLS[spellId];
  if (!def || def.kind !== 'realm') return { ok: false, error: 'No such working.' };
  const knowsIt = player.spells.includes(spellId) ||
    heroesOf(state, pid).some((h) => h.status !== 'dead' && h.spells.includes(spellId));
  if (!knowsIt) return { ok: false, error: 'Your court has not learned that working.' };
  if ((player.spellCooldowns[spellId] ?? 0) > 0) {
    return { ok: false, error: `The working needs ${player.spellCooldowns[spellId]} more ${player.spellCooldowns[spellId] === 1 ? 'season' : 'seasons'} to gather.` };
  }
  const cost = spellCostFor(state, pid, spellId);
  if (player.emberlight < cost) return { ok: false, error: `Needs ${cost} Emberlight.` };

  const needsProvince = def.target === 'ownProvince' || def.target === 'enemyProvince' || def.target === 'anyProvince';
  const p = provinceId !== undefined ? state.provinces[provinceId] : undefined;
  if (needsProvince) {
    if (!p) return { ok: false, error: 'Choose a province.' };
    if (def.target === 'ownProvince' && p.owner !== pid) return { ok: false, error: 'Only in a province you rule.' };
    if (def.target === 'enemyProvince' && (p.owner === pid || p.owner < 0)) return { ok: false, error: 'Only in a rival\'s province.' };
  }

  // ---- the workings themselves
  switch (spellId) {
    case 'scryingSmoke': {
      if (!p) return { ok: false, error: 'Choose a province.' };
      const seen = player.seen;
      if (!seen.includes(p.id)) seen.push(p.id);
      for (const n of p.neighbors) if (!seen.includes(n)) seen.push(n);
      const garrisons = armiesIn(state, p.id);
      const report = garrisons.length === 0
        ? 'no armed company at all'
        : garrisons.map((a) => `${a.units.length} ${a.units.length === 1 ? 'company' : 'companies'} under ${a.owner < 0 ? 'no banner' : lordName(state, a.owner)}`).join('; ');
      scribe(state, {
        kind: 'magic', about: pid, privateTo: pid,
        text: `The smoke over ${p.name} showed true: ${report}. Order stands near ${Math.round(p.order)}, the land yields roughly ${Math.round(p.prosperity * 100)} parts in a hundred.`,
      });
      break;
    }
    case 'blessHarvest': {
      p!.mods.push({ label: 'Blessed harvest', income: 6, order: 3, turnsLeft: 3 });
      scribe(state, { kind: 'magic', about: pid, text: `${lordName(state, pid)}'s adepts blessed the fields of ${p!.name}. The wheat leans toward the sickle, obligingly.` });
      break;
    }
    case 'sowDiscord': {
      p!.mods.push({ label: `Discord sown by ${lordName(state, pid)}`, order: -6, turnsLeft: 3 });
      scribe(state, { kind: 'magic', about: pid, text: `Ugly rumours took root in ${p!.name} — the kind with gardeners. ${lordName(state, p!.owner)} will find the district harder to please for a while.` });
      break;
    }
    case 'wardOfEmbers': {
      p!.mods.push({ label: 'Ward of Embers', defense: 0.2, turnsLeft: 3 });
      scribe(state, { kind: 'magic', about: pid, text: `A ward went up over ${p!.name}: heat-shimmer on the walls, unease in every hostile boot. It will hold three seasons.` });
      break;
    }
    case 'beaconMarch': {
      if (provinceId === undefined) return { ok: false, error: 'Choose a province holding your army.' };
      const army = armiesIn(state, provinceId).find((a) => a.owner === pid && a.moved);
      if (!army) return { ok: false, error: 'No spent army of yours stands there.' };
      army.moved = false;
      army.seaMoved = false;
      scribe(state, { kind: 'magic', about: pid, text: `The high fires were lit and the road rose to meet ${lordName(state, pid)}'s soldiers. They may march again this very season.` });
      break;
    }
    case 'barrowCall': {
      if (!p || p.site !== 'barrow') return { ok: false, error: 'Only at a barrow you rule.' };
      if (p.owner !== pid) return { ok: false, error: 'Only at a barrow you rule.' };
      const existing = armiesIn(state, p.id).find((a) => a.owner === pid && a.units.length <= 10);
      if (existing) existing.units.push(...makeUnits('revenants', 2));
      else newArmy(state, pid, p.id, makeUnits('revenants', 2));
      p.order = clamp(p.order - 4, 0, 100);
      scribe(state, { kind: 'magic', about: pid, text: `The mounds of ${p.name} opened at ${lordName(state, pid)}'s call, and the old dead formed ranks with terrible patience. The living villages bolted their doors (−4 order).` });
      break;
    }
    case 'seersFlame': {
      const lines = state.players
        .filter((o) => o.alive && o.id !== pid)
        .map((o) => {
          const armies = Object.values(state.armies).filter((a) => a.owner === o.id);
          const companies = armies.reduce((n, a) => n + a.units.length, 0);
          return `${lordName(state, o.id)}: ${Math.round(o.gold)} gold, ${companies} companies in ${armies.length} ${armies.length === 1 ? 'army' : 'armies'}, ${heroesOf(state, o.id).length} heroes`;
        });
      scribe(state, {
        kind: 'magic', about: pid, privateTo: pid,
        text: `The Seer's Flame did the realm's accounting: ${lines.join(' · ')}.`,
      });
      break;
    }
    case 'quenchling': {
      p!.order = clamp(p!.order + 15, 0, 100);
      p!.capturedTurn = 0;
      scribe(state, { kind: 'magic', about: pid, text: `A quenchling was loosed in ${p!.name}. It drank the district's grudges dry and departed, faintly larger. (+15 order)` });
      break;
    }
    case 'emberTithe': {
      if (player.gold < 40) return { ok: false, error: 'Needs 40 gold to burn.' };
      player.gold -= 40;
      player.emberlight = Math.min(999, player.emberlight + 10);
      scribe(state, { kind: 'magic', about: pid, text: `Forty gold went into the tithe-brazier of ${lordName(state, pid)} and ten measures of Emberlight came out. The treasury calls it alchemy; the alchemists call it a fire.` });
      break;
    }
    case 'veilOfNight': {
      for (const mine of provincesOf(state, pid)) {
        mine.mods.push({ label: 'Veil of Night', defense: 0.08, turnsLeft: 2 });
      }
      scribe(state, { kind: 'magic', about: pid, text: `Night came down over ${lordName(state, pid)}'s whole realm like a drawn curtain. Maps of it are suddenly unreliable; attacks on it, briefly, more so.` });
      break;
    }
    default:
      return { ok: false, error: 'That working is not cast from the war table.' };
  }

  player.emberlight -= cost;
  player.spellCooldowns[spellId] = def.cooldown;
  effects.push({ e: 'spellCast', spell: spellId, by: pid, province: provinceId ?? null });
  return { ok: true };
}
