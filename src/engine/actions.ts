/**
 * The one gate for change: applyAction validates, mutates, logs.
 * Humans and AIs dispatch the same actions; replays re-apply the log.
 * Validation never consumes randomness — an invalid action leaves the
 * state (and the RNG stream) untouched.
 */
import { applyAdvancedAction } from './advanced';
import { previewBattle, captureProvince, eliminatePlayer, hostileTo, resolveBattle } from './combat';
import { buildingCostFor, unitCostFor } from './economy';
import { BUILDINGS } from './content/world';
import { UNITS } from './content/units';
import { createHero, HERO_CLASSES } from './heroes';
import {
  addDeed, armiesIn, atWar, getStance, lordName, lordOf, setStance,
} from './helpers';
import { say, scribe } from './narrator';
import { Rng } from './rng';
import { beginTurn, endTurnAdvance } from './turn';
import type {
  Action, Army, Effect, GameState, PlayerId, Province,
} from './types';
import { NEUTRAL } from './types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  effects: Effect[];
}

const fail = (error: string): ActionResult => ({ ok: false, error, effects: [] });

// ------------------------------------------------------------ move targets

export interface MoveTarget {
  to: number;
  viaSea: boolean;
  /** A battle will be fought on entry. */
  hostile: boolean;
  /** Road march (two steps through your own roads). */
  viaRoad: boolean;
}

export type EntryKind = 'free' | 'battle' | 'blocked';

export function entryKind(state: GameState, pid: PlayerId, provinceId: number): EntryKind {
  const p = state.provinces[provinceId];
  const hostiles = armiesIn(state, provinceId).filter((a) => hostileTo(state, pid, a.owner));
  if (p.owner >= 0 && p.owner !== pid) {
    const stance = getStance(state, pid, p.owner);
    if (stance !== 'war' && stance !== 'alliance') return 'blocked';
    if (stance === 'alliance') return hostiles.length > 0 ? 'battle' : 'free';
  }
  if (hostiles.length > 0) return 'battle';
  // foreign non-warring armies squatting a free province bar the way
  const foreign = armiesIn(state, provinceId).some((a) => a.owner !== pid && a.owner >= 0 && !atWar(state, pid, a.owner));
  if (p.owner === NEUTRAL && foreign) return 'blocked';
  return 'free';
}

export function moveTargets(state: GameState, army: Army): MoveTarget[] {
  const out: MoveTarget[] = [];
  if (army.moved) return out;
  const pid = army.owner;
  const origin = state.provinces[army.province];
  const seen = new Set<number>();

  for (const n of origin.neighbors) {
    const kind = entryKind(state, pid, n);
    if (kind === 'blocked') continue;
    out.push({ to: n, viaSea: false, hostile: kind === 'battle', viaRoad: false });
    seen.add(n);
  }

  // road march: origin (yours, roads) -> intermediate (yours, roads, calm) -> its neighbors
  if (pid >= 0 && origin.owner === pid && origin.buildings.includes('roads')) {
    for (const mid of origin.neighbors) {
      const m = state.provinces[mid];
      if (m.owner !== pid || !m.buildings.includes('roads')) continue;
      if (armiesIn(state, mid).some((a) => hostileTo(state, pid, a.owner))) continue;
      for (const far of m.neighbors) {
        if (far === origin.id || seen.has(far)) continue;
        const kind = entryKind(state, pid, far);
        if (kind === 'blocked') continue;
        out.push({ to: far, viaSea: false, hostile: kind === 'battle', viaRoad: true });
        seen.add(far);
      }
    }
  }

  // sea lanes from an owned harbor
  if (pid >= 0 && !army.seaMoved && origin.owner === pid && origin.buildings.includes('harbor')) {
    for (const link of origin.seaLinks) {
      if (seen.has(link)) continue;
      const kind = entryKind(state, pid, link);
      if (kind === 'blocked') continue;
      out.push({ to: link, viaSea: true, hostile: kind === 'battle', viaRoad: false });
      seen.add(link);
    }
  }
  return out;
}

function grantSight(state: GameState, pid: PlayerId, provinceId: number): void {
  if (pid < 0) return;
  const seen = state.players[pid].seen;
  const p = state.provinces[provinceId];
  if (!seen.includes(p.id)) seen.push(p.id);
  for (const n of p.neighbors) if (!seen.includes(n)) seen.push(n);
}

// ------------------------------------------------------------- applyAction

export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.phase === 'ended' && action.t !== 'endTurn') {
    return fail('The chronicle is closed.');
  }
  const pid = state.current;
  const player = state.players[pid];
  const effects: Effect[] = [];
  const rng = new Rng(state.rng);

  switch (action.t) {
    case 'endTurn': {
      if (state.phase === 'ended') return fail('The chronicle is closed.');
      log(state, action);
      endTurnAdvance(state, rng, effects);
      return { ok: true, effects };
    }

    case 'setTax': {
      if (!['light', 'fair', 'harsh'].includes(action.level)) return fail('No such tithe.');
      player.tax = action.level;
      log(state, action);
      return { ok: true, effects };
    }

    case 'build': {
      const p = state.provinces[action.province];
      if (!p || p.owner !== pid) return fail('Not your province.');
      if (p.buildQueue) return fail('Builders are already at work here.');
      const def = BUILDINGS[action.building];
      if (!def) return fail('No such works.');
      if (p.buildings.includes(action.building)) return fail('Already built.');
      if (def.requires && !p.buildings.includes(def.requires)) return fail(`Requires ${BUILDINGS[def.requires].name}.`);
      if (def.terrain && !def.terrain.includes(p.terrain)) return fail('The land does not suit it.');
      if (def.coastalOnly && !p.coastal) return fail('Needs a coast.');
      const { cost } = buildingCostFor(state, pid, action.building);
      if (player.gold < cost) return fail(`Needs ${cost} gold.`);
      player.gold -= cost;
      p.buildQueue = { id: action.building, turnsLeft: def.turns };
      log(state, action);
      return { ok: true, effects };
    }

    case 'recruit': {
      const p = state.provinces[action.province];
      if (!p || p.owner !== pid) return fail('Not your province.');
      if (p.recruitQueue) return fail('The muster-yard is busy.');
      const def = UNITS[action.unit];
      if (!def || !def.recruit) return fail('Cannot be raised.');
      const gate = def.recruit;
      const fx = lordOf(player).perk.fx;
      if (gate.building && !p.buildings.includes(gate.building)) {
        return fail(`Requires ${BUILDINGS[gate.building].name}.`);
      }
      if (gate.terrain && !gate.terrain.includes(p.terrain)) {
        const cragException = action.unit === 'cragguard' && fx.cragguardInHills && p.terrain === 'hills';
        if (!cragException) return fail('The land does not breed them.');
      }
      if (gate.creed && lordOf(player).creed !== gate.creed) return fail('Not of your creed.');
      if (action.unit === 'revenants') {
        if (!fx.revenantsAtBarrows) return fail('The dead do not answer you.');
        if (p.site !== 'barrow') return fail('Only at a barrow.');
      }
      const { cost } = unitCostFor(state, pid, action.unit);
      if (player.gold < cost) return fail(`Needs ${cost} gold.`);
      player.gold -= cost;
      p.recruitQueue = { unit: action.unit, turnsLeft: 1 };
      log(state, action);
      return { ok: true, effects };
    }

    case 'disband': {
      const army = state.armies[action.armyId];
      if (!army || army.owner !== pid) return fail('Not your army.');
      if (action.index < 0 || action.index >= army.units.length) return fail('No such company.');
      army.units.splice(action.index, 1);
      if (army.units.length === 0 && army.heroIds.length === 0) delete state.armies[army.id];
      else if (army.units.length === 0) {
        // heroes cannot hold a banner alone; they return to court
        for (const hid of [...army.heroIds]) {
          const hero = state.heroes[hid];
          if (hero) {
            hero.armyId = null;
            hero.province = army.province;
          }
        }
        delete state.armies[army.id];
      }
      log(state, action);
      return { ok: true, effects };
    }

    case 'setStance': {
      const army = state.armies[action.armyId];
      if (!army || army.owner !== pid) return fail('Not your army.');
      if (!['bold', 'measured', 'wary'].includes(action.stance)) return fail('No such stance.');
      army.stance = action.stance;
      log(state, action);
      return { ok: true, effects };
    }

    case 'moveArmy': {
      const army = state.armies[action.armyId];
      if (!army || army.owner !== pid) return fail('Not your army.');
      const targets = moveTargets(state, army);
      const target = targets.find((t) => t.to === action.to && t.viaSea === !!action.viaSea);
      if (!target) return fail('No road leads there this season.');
      log(state, action);
      executeMove(state, rng, army, target, effects);
      return { ok: true, effects };
    }

    case 'splitArmy': {
      const army = state.armies[action.armyId];
      if (!army || army.owner !== pid) return fail('Not your army.');
      if (army.moved) return fail('Already marched.');
      const idxs = [...new Set(action.unitIdx)].sort((a, b) => b - a);
      if (idxs.length === 0) return fail('Choose companies to march.');
      if (idxs.some((i) => i < 0 || i >= army.units.length)) return fail('No such company.');
      if (idxs.length >= army.units.length && action.heroIds.length >= army.heroIds.length) {
        return fail('That is the whole army — just march it.');
      }
      if (idxs.length >= army.units.length) return fail('The banner must keep at least one company.');
      for (const hid of action.heroIds) {
        if (!army.heroIds.includes(hid)) return fail('That hero rides under another banner.');
      }
      // build the detachment
      const detached = idxs.map((i) => army.units[i]);
      for (const i of idxs) army.units.splice(i, 1);
      const newArmyObj: Army = {
        id: state.nextArmyId++,
        owner: pid,
        province: army.province,
        units: detached.reverse(),
        heroIds: [...action.heroIds],
        moved: false,
        stance: army.stance,
      };
      state.armies[newArmyObj.id] = newArmyObj;
      for (const hid of action.heroIds) {
        army.heroIds = army.heroIds.filter((h) => h !== hid);
        const hero = state.heroes[hid];
        if (hero) hero.armyId = newArmyObj.id;
      }
      log(state, action);
      if (action.to !== army.province) {
        const targets = moveTargets(state, newArmyObj);
        const target = targets.find((t) => t.to === action.to && t.viaSea === !!action.viaSea);
        if (target) {
          executeMove(state, rng, newArmyObj, target, effects);
        }
      }
      return { ok: true, effects };
    }

    case 'mergeArmies': {
      const from = state.armies[action.from];
      const into = state.armies[action.into];
      if (!from || !into || from.owner !== pid || into.owner !== pid) return fail('Not your armies.');
      if (from.id === into.id) return fail('That is one army.');
      if (from.province !== into.province) return fail('They stand in different provinces.');
      if (from.units.length + into.units.length > 12) return fail('A banner holds twelve companies at most.');
      if (from.heroIds.length + into.heroIds.length > 3) return fail('Three heroes to a banner at most.');
      into.units.push(...from.units);
      into.heroIds.push(...from.heroIds);
      for (const hid of from.heroIds) {
        const hero = state.heroes[hid];
        if (hero) hero.armyId = into.id;
      }
      into.moved = into.moved || from.moved;
      delete state.armies[from.id];
      log(state, action);
      return { ok: true, effects };
    }

    case 'hireHero': {
      const offer = player.courtOffers[action.offerIdx];
      if (!offer) return fail('That petitioner has left.');
      if (player.gold < offer.cost) return fail(`Needs ${offer.cost} gold.`);
      const heroCount = Object.values(state.heroes).filter((hh) => hh.owner === pid && hh.status !== 'dead').length;
      if (heroCount >= 5) return fail('Your court is full (five heroes).');
      player.gold -= offer.cost;
      player.courtOffers.splice(action.offerIdx, 1);
      const home = state.provinces[player.seatProvince].owner === pid
        ? player.seatProvince
        : state.provinces.find((p) => p.owner === pid)?.id ?? player.seatProvince;
      const hero = createHero(state, rng, pid, offer.cls, offer.level, home, { name: offer.name, epithet: offer.epithet });
      hero.might = offer.might;
      hero.lore = offer.lore;
      hero.guile = offer.guile;
      hero.leadership = offer.leadership;
      effects.push({ e: 'heroHired', heroId: hero.id });
      say(state, rng, 'heroHired', {
        hero: hero.name, epithet: hero.epithet, lord: lordName(state, pid), cls: HERO_CLASSES[hero.cls].name.toLowerCase(),
      }, { about: pid });
      log(state, action);
      return { ok: true, effects };
    }

    case 'dismissHero': {
      const hero = state.heroes[action.heroId];
      if (!hero || hero.owner !== pid || hero.status === 'dead') return fail('No such hero in your service.');
      if (hero.status === 'questing') return fail('They are away on a quest.');
      if (hero.armyId !== null) {
        const army = state.armies[hero.armyId];
        if (army) army.heroIds = army.heroIds.filter((h) => h !== hero.id);
      }
      // artifacts return to the vault
      for (const slot of ['weapon', 'armor', 'trinket'] as const) {
        const art = hero.artifacts[slot];
        if (art !== null) {
          player.vault.push(art);
          hero.artifacts[slot] = null;
        }
      }
      scribe(state, {
        kind: 'hero',
        about: pid,
        text: `${hero.name}, ${hero.epithet}, left ${lordName(state, pid)}'s service with fair words and a full purse. The margin closes on them, unfilled.`,
      });
      delete state.heroes[hero.id];
      log(state, action);
      return { ok: true, effects };
    }

    case 'attachHero': {
      const hero = state.heroes[action.heroId];
      if (!hero || hero.owner !== pid) return fail('Not your hero.');
      if (hero.status !== 'ready') return fail('The hero is not at liberty.');
      if (action.armyId === null) {
        if (hero.armyId !== null) {
          const army = state.armies[hero.armyId];
          if (army) {
            army.heroIds = army.heroIds.filter((hh) => hh !== hero.id);
            hero.province = army.province;
          }
          hero.armyId = null;
        }
        log(state, action);
        return { ok: true, effects };
      }
      const army = state.armies[action.armyId];
      if (!army || army.owner !== pid) return fail('Not your army.');
      if (army.heroIds.length >= 3) return fail('Three heroes to a banner at most.');
      const sameProvince = hero.armyId === null && hero.province === army.province;
      const fromArmyHere = hero.armyId !== null && state.armies[hero.armyId]?.province === army.province;
      const safePassage = hero.armyId === null && state.provinces[army.province].owner === pid;
      if (!sameProvince && !fromArmyHere && !safePassage) {
        return fail('The hero cannot reach that banner (same province, or any province you rule).');
      }
      if (hero.armyId !== null) {
        const old = state.armies[hero.armyId];
        if (old) old.heroIds = old.heroIds.filter((hh) => hh !== hero.id);
      }
      hero.armyId = army.id;
      hero.province = army.province;
      army.heroIds.push(hero.id);
      log(state, action);
      return { ok: true, effects };
    }

    case 'diplomacy': {
      return diplomacyAction(state, rng, pid, action, effects);
    }

    case 'respond': {
      const idx = state.proposals.findIndex((pr) => pr.id === action.proposalId);
      if (idx === -1) return fail('The messenger has gone.');
      const proposal = state.proposals[idx];
      if (proposal.to !== pid) return fail('Not addressed to you.');
      state.proposals.splice(idx, 1);
      log(state, action);
      applyProposalResponse(state, rng, proposal, action.accept, effects);
      return { ok: true, effects };
    }

    case 'concede': {
      if (!player.alive) return fail('Already fallen.');
      for (const p of state.provinces) {
        if (p.owner === pid) {
          p.owner = NEUTRAL;
          p.seatOf = null;
          p.capturedTurn = state.turn;
        }
      }
      eliminatePlayer(state, rng, pid, 'the long war itself, conceded with dignity', effects);
      log(state, action);
      endTurnAdvance(state, rng, effects);
      return { ok: true, effects };
    }

    // -------- placeholders for systems that land with heroes/magic phase
    case 'chooseSkill':
    case 'equip':
    case 'unequip':
    case 'startQuest':
    case 'startRite':
    case 'pledgeEmberlight':
    case 'castSpell':
    case 'eventChoice': {
      return applyAdvancedAction(state, rng, pid, action, effects);
    }

    default:
      return fail('Unknown action.');
  }
}

// --------------------------------------------------------------- movement

function executeMove(state: GameState, rng: Rng, army: Army, target: MoveTarget, effects: Effect[]): void {
  const from = army.province;
  const pid = army.owner;
  if (target.viaSea) {
    army.seaMoved = true;
    const freeSail = pid >= 0 && lordOf(state.players[pid]).perk.fx.seaMoveFree;
    if (!freeSail) army.moved = true;
  } else {
    army.moved = true;
  }

  if (target.hostile) {
    const outcome = resolveBattle(state, rng, army.id, target.to, target.viaSea, from);
    effects.push(...outcome.effects);
    grantSight(state, pid, target.to);
    return;
  }

  army.province = target.to;
  grantSight(state, pid, target.to);
  const p = state.provinces[target.to];
  if (p.owner !== pid && (p.owner === NEUTRAL || atWar(state, pid, p.owner))) {
    captureProvince(state, rng, p, pid, effects);
  }
}

// -------------------------------------------------------------- diplomacy

function diplomacyAction(
  state: GameState,
  rng: Rng,
  pid: PlayerId,
  action: Extract<Action, { t: 'diplomacy' }>,
  effects: Effect[],
): ActionResult {
  const target = action.target;
  if (target === pid || target < 0 || target >= state.players.length) return fail('No such lord.');
  if (!state.players[target].alive) return fail('That banner has already fallen.');
  const player = state.players[pid];
  const stance = getStance(state, pid, target);

  switch (action.kind) {
    case 'declareWar': {
      if (stance === 'war') return fail('Already at war.');
      const oathbroken = stance === 'pact' || stance === 'alliance';
      setStance(state, pid, target, 'war');
      addDeed(state, target, pid, {
        id: 'declaredWar',
        label: oathbroken ? 'Broke our pact with steel' : 'Declared war upon us',
        delta: oathbroken ? -45 : -25,
        decay: oathbroken ? 0.4 : 0.8,
      });
      if (oathbroken) {
        for (const other of state.players) {
          if (other.id !== pid && other.id !== target && other.alive) {
            addDeed(state, other.id, pid, { id: 'oathbreaker', label: 'Known oathbreaker', delta: -10, decay: 0.5 });
          }
        }
      }
      say(state, rng, 'warDeclared', {
        aggressor: lordName(state, pid),
        target: lordName(state, target),
        oathbroken,
      }, { about: pid });
      effects.push({ e: 'diplo', kind: 'war', from: pid, to: target });
      log(state, action);
      return { ok: true, effects };
    }

    case 'offerPeace': {
      if (stance !== 'war') return fail('You are not at war.');
      const gold = Math.max(0, Math.floor(action.gold ?? 0));
      if (player.gold < gold) return fail('Your treasury cannot cover that sweetener.');
      queueProposal(state, pid, target, 'peace', gold, `${lordName(state, pid)} proposes peace${gold > 0 ? `, sweetened with ${gold} gold` : ''}.`);
      effects.push({ e: 'proposal', proposal: state.proposals[state.proposals.length - 1] });
      log(state, action);
      return { ok: true, effects };
    }

    case 'offerPact': {
      if (stance !== 'peace') return fail(stance === 'war' ? 'Make peace first.' : 'You are already bound.');
      queueProposal(state, pid, target, 'pact', 0, `${lordName(state, pid)} proposes a pact of non-aggression, sworn and sealed.`);
      effects.push({ e: 'proposal', proposal: state.proposals[state.proposals.length - 1] });
      log(state, action);
      return { ok: true, effects };
    }

    case 'offerAlliance': {
      if (stance !== 'pact') return fail('An alliance grows from a pact.');
      queueProposal(state, pid, target, 'alliance', 0, `${lordName(state, pid)} proposes a full alliance — shared wars, shared roads.`);
      effects.push({ e: 'proposal', proposal: state.proposals[state.proposals.length - 1] });
      log(state, action);
      return { ok: true, effects };
    }

    case 'gift': {
      const gold = Math.max(0, Math.floor(action.gold ?? 0));
      if (gold <= 0) return fail('A gift needs substance.');
      if (player.gold < gold) return fail('Your treasury cannot cover it.');
      player.gold -= gold;
      state.players[target].gold += gold;
      const warmth = Math.min(20, 4 + gold / 25);
      addDeed(state, target, pid, { id: 'gift', label: `Sent us ${gold} gold`, delta: warmth, decay: 0.6 });
      effects.push({ e: 'diplo', kind: 'gift', from: pid, to: target });
      log(state, action);
      return { ok: true, effects };
    }

    case 'demand': {
      if (stance === 'alliance') return fail('One does not shake down an ally.');
      const gold = Math.max(0, Math.floor(action.gold ?? 0));
      if (gold <= 0) return fail('Demand something.');
      queueProposal(state, pid, target, 'demand', gold, `${lordName(state, pid)} demands ${gold} gold — or consequences.`);
      addDeed(state, target, pid, { id: 'demanded', label: 'Made demands of us', delta: -8, decay: 1 });
      effects.push({ e: 'proposal', proposal: state.proposals[state.proposals.length - 1] });
      log(state, action);
      return { ok: true, effects };
    }

    case 'breakPact': {
      if (stance !== 'pact' && stance !== 'alliance') return fail('No pact binds you.');
      setStance(state, pid, target, 'peace');
      addDeed(state, target, pid, { id: 'brokePact', label: 'Cast off our pact', delta: -20, decay: 0.7 });
      scribe(state, {
        kind: 'diplomacy',
        about: pid,
        text: `${lordName(state, pid)} returned the pact-seal to ${lordName(state, target)} with cold courtesies. Not war — but the ink of peace is drying.`,
      });
      effects.push({ e: 'diplo', kind: 'breakPact', from: pid, to: target });
      log(state, action);
      return { ok: true, effects };
    }

    default:
      return fail('Unknown overture.');
  }
}

function queueProposal(
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  kind: 'peace' | 'pact' | 'alliance' | 'gift' | 'demand' | 'joinWar',
  gold: number,
  note: string,
): void {
  state.proposals.push({ id: state.nextProposalId++, from, to, kind, gold, turn: state.turn, note });
}

export function applyProposalResponse(
  state: GameState,
  rng: Rng,
  proposal: { from: PlayerId; to: PlayerId; kind: string; gold: number },
  accept: boolean,
  effects: Effect[],
): void {
  const { from, to } = proposal;
  if (!state.players[from].alive || !state.players[to].alive) return;
  switch (proposal.kind) {
    case 'peace': {
      if (!accept) {
        addDeed(state, from, to, { id: 'spurnedPeace', label: 'Spurned our peace', delta: -6, decay: 1.2 });
        break;
      }
      if (getStance(state, from, to) !== 'war') break;
      setStance(state, from, to, 'peace');
      const gold = Math.min(proposal.gold, state.players[from].gold);
      if (gold > 0) {
        state.players[from].gold -= gold;
        state.players[to].gold += gold;
      }
      addDeed(state, to, from, { id: 'peace', label: 'Made peace honorably', delta: 10, decay: 0.5 });
      addDeed(state, from, to, { id: 'peace', label: 'Made peace honorably', delta: 10, decay: 0.5 });
      say(state, rng, 'peaceMade', { a: lordName(state, from), b: lordName(state, to) }, { about: from });
      effects.push({ e: 'diplo', kind: 'peace', from, to });
      break;
    }
    case 'pact': {
      if (!accept) break;
      if (getStance(state, from, to) !== 'peace') break;
      setStance(state, from, to, 'pact');
      addDeed(state, to, from, { id: 'pact', label: 'Sworn to a pact', delta: 12, decay: 0.3 });
      addDeed(state, from, to, { id: 'pact', label: 'Sworn to a pact', delta: 12, decay: 0.3 });
      scribe(state, {
        kind: 'diplomacy',
        about: from,
        text: `${lordName(state, from)} and ${lordName(state, to)} sealed a pact of non-aggression. Wax, ribbon, witnesses — the full theatre of trust.`,
      });
      effects.push({ e: 'diplo', kind: 'pact', from, to });
      break;
    }
    case 'alliance': {
      if (!accept) break;
      if (getStance(state, from, to) !== 'pact') break;
      setStance(state, from, to, 'alliance');
      addDeed(state, to, from, { id: 'alliance', label: 'Bound in alliance', delta: 18, decay: 0.2 });
      addDeed(state, from, to, { id: 'alliance', label: 'Bound in alliance', delta: 18, decay: 0.2 });
      scribe(state, {
        kind: 'diplomacy',
        about: from,
        text: `An alliance: ${lordName(state, from)} and ${lordName(state, to)}, banners knotted. The other lords began, quietly, to count.`,
      });
      effects.push({ e: 'diplo', kind: 'alliance', from, to });
      break;
    }
    case 'demand': {
      if (accept) {
        const gold = Math.min(proposal.gold, state.players[to].gold);
        let taken = gold;
        const fx = lordOf(state.players[from]).perk.fx;
        if (fx.demandBonusPct) taken = Math.round(taken * (1 + fx.demandBonusPct / 100));
        state.players[to].gold -= gold;
        state.players[from].gold += taken;
        addDeed(state, to, from, { id: 'paidDemand', label: 'Squeezed tribute from us', delta: -10, decay: 0.8 });
        scribe(state, {
          kind: 'diplomacy',
          about: from,
          text: `${lordName(state, to)} paid ${lordName(state, from)}'s demand of ${gold} gold. Cheaper than war, the counting-house says. The heart keeps a different ledger.`,
        });
      } else {
        addDeed(state, from, to, { id: 'refusedDemand', label: 'Defied our demand', delta: -10, decay: 1 });
        addDeed(state, to, from, { id: 'demandRefused', label: 'Tried to squeeze us', delta: -6, decay: 1 });
      }
      effects.push({ e: 'diplo', kind: accept ? 'tribute' : 'defiance', from, to });
      break;
    }
  }
}

// ------------------------------------------------------------------- log

function log(state: GameState, action: Action): void {
  state.log.push({ player: state.current, turn: state.turn, action });
}

export { beginTurn };
export { previewBattle };
