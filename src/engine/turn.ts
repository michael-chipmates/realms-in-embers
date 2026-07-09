/**
 * The turn cycle: per-player upkeep at turn start, and the round-end tick
 * (neutral raids, victory checks, stats, omens) when the table comes back
 * around to the first banner.
 */
import { eliminatePlayer, resolveBattle } from './combat';
import { decayDeeds } from './diplo';
import { drawEvent } from './events';
import { refreshRiteOffers } from './magic';
import { refreshQuestOffers, tickQuests } from './quests';
import { teach } from './teachings';
import { incomeReport, isDefiant, orderDrift, prosperityStep, leaderId, strainOf } from './economy';
import { makeCourtOffer, makeTroubleName } from './state';
import { UNITS } from './content/units';
import {
  addDeed, armiesIn, armiesOf, clamp, getStance, heroesOf, lordName, makeUnits, newArmy, provincesOf, roughArmyPower,
} from './helpers';
import { say, scribe } from './narrator';
import type { Rng } from './rng';
import type { Effect, GameState, PlayerId, Province } from './types';
import { NEUTRAL } from './types';
import { checkVictory } from './victory';

/** Everything that happens when a player's turn begins. */
export function beginTurn(state: GameState, rng: Rng, effects: Effect[]): void {
  const pid = state.current;
  const player = state.players[pid];
  if (!player.alive || state.phase === 'ended') return;

  // fresh legs
  for (const army of armiesOf(state, pid)) {
    army.moved = false;
    army.seaMoved = false;
  }

  // construction & muster
  for (const p of provincesOf(state, pid)) {
    if (p.buildQueue) {
      p.buildQueue.turnsLeft--;
      if (p.buildQueue.turnsLeft <= 0) {
        p.buildings.push(p.buildQueue.id);
        p.buildQueue = null;
      }
    }
    if (p.recruitQueue) {
      p.recruitQueue.turnsLeft--;
      if (p.recruitQueue.turnsLeft <= 0) {
        deliverRecruits(state, p, p.recruitQueue.unit);
        p.recruitQueue = null;
      }
    }
  }

  // coin
  const report = incomeReport(state, pid);
  player.gold += report.net;
  player.emberlight = Math.min(999, player.emberlight + report.emberlight);
  if (player.gold < 0) {
    enforceInsolvency(state, rng, pid, effects);
  }

  // order, prosperity, temporary modifiers
  for (const p of provincesOf(state, pid)) {
    const drift = orderDrift(state, p);
    p.order = clamp(p.order + drift.total, 0, 100);
    p.prosperity = prosperityStep(state, p);
    for (const mod of p.mods) mod.turnsLeft--;
    p.mods = p.mods.filter((m) => m.turnsLeft > 0);
  }

  // unrest boils over
  for (const p of provincesOf(state, pid)) {
    if (p.order < 40) teach(state, pid, 'firstLowOrder');
    if (p.order < 25 && rng.chance((25 - p.order) * 0.016)) {
      spawnRebellion(state, rng, p, effects);
    }
  }
  if (strainOf(state, pid) !== 0) teach(state, pid, 'firstStrain');
  if (isDefiant(state, pid)) teach(state, pid, 'firstDefiance');

  // heroes mend
  for (const hero of heroesOf(state, pid)) {
    if (hero.status === 'wounded') {
      hero.woundedTurns--;
      if (hero.woundedTurns <= 0) {
        hero.status = 'ready';
        hero.woundedTurns = 0;
      }
    }
  }

  // spell cooldowns
  for (const key of Object.keys(player.spellCooldowns) as (keyof typeof player.spellCooldowns)[]) {
    const left = (player.spellCooldowns[key] ?? 0) - 1;
    if (left <= 0) delete player.spellCooldowns[key];
    else player.spellCooldowns[key] = left;
  }

  // the court turns over
  player.courtOffers = player.courtOffers.filter((o) => o.expiresTurn >= state.turn);
  const heroCount = heroesOf(state, pid).length;
  if (player.courtOffers.length < 2 && heroCount < 5 && rng.chance(player.courtOffers.length === 0 ? 0.75 : 0.4)) {
    player.courtOffers.push(makeCourtOffer(rng, state.turn));
  }

  // quests return, the board refreshes, the realm answers back
  tickQuests(state, rng, pid, effects);
  refreshQuestOffers(state, rng, pid);
  if (player.riteOffers.length === 0 && !player.rite) {
    refreshRiteOffers(state, rng, pid);
  }
  drawEvent(state, rng, pid, effects);

  // guild debts come due (from the counting-house event)
  const dueFlag = Object.keys(player.flags).find((f) => f.startsWith('guildLoanDue:'));
  if (dueFlag) {
    const dueTurn = parseInt(dueFlag.split(':')[1], 10);
    if (state.turn >= dueTurn) {
      delete player.flags[dueFlag];
      delete player.flags.guildLoanOut;
      if (player.gold >= 240) {
        player.gold -= 240;
        scribe(state, {
          kind: 'realm', about: pid,
          text: `${lordName(state, pid)} repaid the Guild of Weights and Measures in full — 240 gold, counted twice. The clerk's smile flickered, which the treasury counts as a victory.`,
        });
      } else {
        for (const p of provincesOf(state, pid)) p.order = clamp(p.order - 5, 0, 100);
        scribe(state, {
          kind: 'realm', about: pid,
          text: `${lordName(state, pid)} defaulted on the Guild loan. No bailiffs came — only a realm-wide whisper about credit, which is worse. (−5 order everywhere)`,
        });
      }
    }
  }

  // stale proposals wither
  state.proposals = state.proposals.filter((pr) => state.turn - pr.turn <= 3);

  effects.push({ e: 'turnStart', player: pid, income: report });
}

function deliverRecruits(state: GameState, p: Province, unit: keyof typeof UNITS): void {
  const own = armiesIn(state, p.id).filter((a) => a.owner === p.owner && a.units.length < 12);
  if (own.length > 0) {
    own[0].units.push(...makeUnits(unit, 1));
  } else {
    newArmy(state, p.owner, p.id, makeUnits(unit, 1));
  }
}

/** Broke: soldiers walk, order suffers. Always visible, never a mystery. */
function enforceInsolvency(state: GameState, rng: Rng, pid: PlayerId, effects: Effect[]): void {
  const player = state.players[pid];
  const disbanded: string[] = [];
  while (player.gold < 0) {
    // cheapest-to-keep company goes first
    let worst: { armyId: number; idx: number; upkeep: number } | null = null;
    for (const army of armiesOf(state, pid)) {
      army.units.forEach((u, idx) => {
        const up = UNITS[u.type].upkeep;
        if (!worst || up < worst.upkeep) worst = { armyId: army.id, idx, upkeep: up };
      });
    }
    if (!worst) {
      player.gold = 0;
      break;
    }
    const w: { armyId: number; idx: number; upkeep: number } = worst;
    const army = state.armies[w.armyId];
    const [gone] = army.units.splice(w.idx, 1);
    disbanded.push(UNITS[gone.type].name);
    if (army.units.length === 0) {
      // heroes cannot hold a banner alone; back to court with them
      for (const hid of [...army.heroIds]) {
        const hero = state.heroes[hid];
        if (hero) {
          hero.armyId = null;
          hero.province = army.province;
        }
      }
      delete state.armies[w.armyId];
    }
    player.gold += 12; // mustering-out pittance recovered
  }
  if (disbanded.length > 0) {
    for (const p of provincesOf(state, pid)) p.order = clamp(p.order - 2, 0, 100);
    scribe(state, {
      kind: 'realm',
      about: pid,
      text: `${lordName(state, pid)}'s treasury ran dry. ${disbanded.length} ${disbanded.length === 1 ? 'company' : 'companies'} were paid in apologies and sent home; the realm noticed (order −2).`,
    });
    effects.push({ e: 'chronicle', entry: state.chronicle[state.chronicle.length - 1] });
  }
  player.gold = Math.max(0, player.gold);
}

export function spawnRebellion(state: GameState, rng: Rng, p: Province, effects: Effect[]): void {
  const owner = p.owner;
  if (owner < 0) return;
  const size = clamp(2 + Math.floor(p.prosperity * 2 + p.order / 30), 2, 5);
  const rebels = newArmy(state, NEUTRAL, p.id, makeUnits('rebels', size), { stance: 'bold', kind: 'rebels' });
  p.order = clamp(p.order + 28, 0, 100); // the angriest have taken to the field
  const leader = makeTroubleName(rng);
  say(state, rng, 'rebellion', { lord: lordName(state, owner), province: p.name, leader }, { about: owner });
  teach(state, owner, 'firstRebellion');
  effects.push({ e: 'rebellion', province: p.id });
  // a rising strikes at once if the province is garrisoned — steel decides
  const garrison = armiesIn(state, p.id).filter((a) => a.owner !== NEUTRAL);
  if (garrison.length > 0 && state.armies[rebels.id]) {
    const outcome = resolveBattle(state, rng, rebels.id, p.id, false, p.id);
    effects.push(...outcome.effects);
  }
}

/** Advance to the next player; when the round wraps, run the world tick. */
export function endTurnAdvance(state: GameState, rng: Rng, effects: Effect[]): void {
  if (state.phase === 'ended') return;
  const n = state.players.length;
  let next = -1;
  for (let step = 1; step <= n; step++) {
    const candidate = (state.current + step) % n;
    if (state.players[candidate].alive) {
      next = candidate;
      break;
    }
  }
  if (next === -1) return; // no one left; victory check already handled

  const wrapped = next <= state.current;
  if (wrapped) {
    roundEnd(state, rng, effects);
    if (state.victory.winner !== null) return; // roundEnd may close the chronicle
  }
  state.current = next;
  beginTurn(state, rng, effects);
}

function roundEnd(state: GameState, rng: Rng, effects: Effect[]): void {
  // -- the leaderless act: rebels press, marauders raid, revenants brood
  for (const army of Object.values(state.armies)) {
    if (army.owner !== NEUTRAL || army.units.length === 0) continue;
    if (!army.kind) continue; // free-province garrisons keep to their homes
    const kind = army.kind;
    if (kind === 'revenants') continue; // the dead are patient
    const p = state.provinces[army.province];
    const raidChance = kind === 'rebels' ? 0.4 : 0.25;
    if (!rng.chance(raidChance)) continue;
    // target: adjacent owned province, weakest garrison, richest for marauders
    const targets = p.neighbors
      .map((id) => state.provinces[id])
      .filter((t) => t.owner >= 0);
    if (p.owner >= 0) targets.push(p); // rebels strike the province they infest first
    if (targets.length === 0) continue;
    const myPower = roughArmyPower(army);
    const viable = targets.filter((t) => {
      const defenders = armiesIn(state, t.id).filter((a) => a.owner !== NEUTRAL);
      const defPower = defenders.reduce((s, a) => s + roughArmyPower(a), 0);
      return defPower < myPower * 1.2;
    });
    if (viable.length === 0) continue;
    const target = kind === 'marauders'
      ? viable.reduce((a, b) => (b.prosperity > a.prosperity ? b : a))
      : rng.pick(viable);
    const defenders = armiesIn(state, target.id).filter((a) => a.owner !== NEUTRAL);
    if (defenders.length === 0) {
      // undefended: the province falls out of the realm entirely
      if (target.owner >= 0) {
        const prevOwner = target.owner;
        target.owner = NEUTRAL;
        target.seatOf = null;
        target.capturedTurn = state.turn;
        target.order = 50;
        scribe(state, {
          kind: 'realm',
          about: prevOwner,
          text: kind === 'rebels'
            ? `${target.name} threw off ${lordName(state, prevOwner)}'s governors entirely. The straw crown flies over a free province — for now.`
            : `Wolfsheads sacked ${target.name} and no banner came to stop them. ${lordName(state, prevOwner)}'s writ ends at its borders now.`,
        });
        if (target.id !== army.province) army.province = target.id;
        const remaining = state.provinces.filter((pp) => pp.owner === prevOwner).length;
        if (remaining === 0) {
          eliminatePlayer(state, rng, prevOwner, 'a straw-crowned rising of their own subjects', effects);
        }
      }
    } else if (target.id !== army.province) {
      resolveBattle(state, rng, army.id, target.id, false, army.province);
    }
  }

  // -- memory fades a little
  decayDeeds(state);

  // -- season turns
  state.turn++;

  // -- leader bookkeeping (visible strain/defiance recompute lazily)
  const lead = leaderId(state);
  if (lead !== state.leaderSince) {
    state.leaderSince = lead;
    state.leaderRounds = 0;
  } else {
    state.leaderRounds++;
  }

  // -- the league: when one banner grows past arguing, the realm answers.
  // Fires once per game; visible in every rival's attitude ledger.
  if (state.victory.coalitionTurn === null && lead !== null) {
    const share = provincesOf(state, lead).length / state.provinces.length;
    const others = state.players.filter((p) => p.alive && p.id !== lead);
    const longReign = share >= 0.34 && state.leaderRounds >= 10;
    if ((share >= 0.4 || longReign) && others.length >= 2) {
      state.victory.coalitionTurn = state.turn;
      for (const p of others) {
        addDeed(state, p.id, lead, {
          id: 'coalition', label: 'The realm leagues against the mighty', delta: -15, decay: 0.15,
        });
        for (const q of others) {
          if (q.id <= p.id) continue;
          if (getStance(state, p.id, q.id) === 'war') continue;
          addDeed(state, p.id, q.id, { id: 'leagueFellow', label: 'Fellow of the league', delta: 8, decay: 0.2 });
          addDeed(state, q.id, p.id, { id: 'leagueFellow', label: 'Fellow of the league', delta: 8, decay: 0.2 });
        }
      }
      say(state, rng, 'coalition', {
        lord: lordName(state, lead),
        share: Math.round(share * 100),
      }, { about: lead });
    }
  }

  // -- statistics for graphs & the saga
  state.stats.push({
    turn: state.turn,
    perPlayer: state.players.map((player) => {
      const provinces = provincesOf(state, player.id);
      const report = player.alive ? incomeReport(state, player.id) : null;
      return {
        player: player.id,
        provinces: provinces.length,
        gold: Math.round(player.gold),
        income: report ? report.net : 0,
        armyPower: Math.round(armiesOf(state, player.id).reduce((s, a) => s + roughArmyPower(a), 0)),
        heroes: heroesOf(state, player.id).length,
        spellsKnown: player.spells.length,
        order: provinces.length > 0 ? Math.round(provinces.reduce((s, p) => s + p.order, 0) / provinces.length) : 0,
      };
    }),
  });

  // -- the pen keeps its own counsel
  if (rng.chance(0.22)) {
    const lead = leaderId(state);
    say(state, rng, 'roundOmen', {
      turn: state.turn,
      leader: lead !== null ? lordName(state, lead) : 'no one, if the innkeepers are honest',
    });
  }

  checkVictory(state, rng, effects);
  effects.push({ e: 'roundEnd', turn: state.turn });
}
