/**
 * The rival lords. One brain, twelve temperaments: every weight below is
 * scaled by the lord's published personality, so Vaelia genuinely hunts and
 * Cormac genuinely waits. The AI sees no hidden information: it reads the
 * same odds preview and the same attitude arithmetic the player reads,
 * and difficulty changes only its purse (the visible handicap) and nerve.
 */
import { applyAction, moveTargets } from './actions';
import { previewBattle } from './combat';
import { attitudeOf } from './diplo';
import { aiResolveEvents } from './events';
import { heroDerived } from './heroFx';
import { SKILLS } from './content/skills';
import { ARTIFACTS, type ArtifactFx } from './content/artifacts';
import { SPELLS } from './content/spells';
import { QUESTS } from './content/quests';
import { spellCostFor } from './magic';
import { questStat, sagaAvailable } from './quests';
import { Rng } from './rng';
import { buildingCostFor, incomeReport, unitCostFor } from './economy';
import { BUILD_ORDER, BUILDINGS } from './content/world';
import { RECRUITABLE, UNITS } from './content/units';
import {
  armiesIn, armiesOf, atWar, creedOf, deedsOf, getStance, heroesOf, lordOf, provincesOf, roughArmyPower,
} from './helpers';
import { leaderId } from './economy';
import type { Action, Army, Effect, GameState, PlayerId, Province, UnitTypeId } from './types';
import { NEUTRAL } from './types';

const MAX_ACTIONS_PER_TURN = 80;

/** Play out the current AI player's whole turn. Ends with endTurn. */
export function aiTakeTurn(state: GameState): Effect[] {
  const pid = state.current;
  const player = state.players[pid];
  const effects: Effect[] = [];
  let budget = MAX_ACTIONS_PER_TURN;

  const dispatch = (action: Action): boolean => {
    if (budget <= 0) return false;
    budget--;
    const result = applyAction(state, action);
    effects.push(...result.effects);
    return result.ok;
  };

  const endTurn = (): void => {
    // never subject to the action budget — a turn must always end
    if (state.phase === 'ended') return;
    const result = applyAction(state, { t: 'endTurn' });
    effects.push(...result.effects);
  };

  if (player.kind !== 'ai' || !player.alive || state.phase === 'ended') {
    endTurn();
    return effects;
  }

  const persona = lordOf(player).personality;
  const nerve = attackNerve(state, pid); // odds threshold, personality+difficulty

  respondToEvents(state, pid, dispatch);
  respondToProposals(state, pid, dispatch);
  chooseSkills(state, pid, dispatch);
  equipArtifacts(state, pid, dispatch);
  setTaxPolicy(state, pid, dispatch);
  hireFromCourt(state, pid, dispatch);
  buildSomething(state, pid, dispatch);
  buildSomething(state, pid, dispatch); // second project if rich
  recruitTroops(state, pid, dispatch);
  runMagic(state, pid, dispatch);
  maybeUseSignature(state, pid, dispatch);
  runQuests(state, pid, dispatch);
  marshalHeroes(state, pid, dispatch);
  consolidateArmies(state, pid, dispatch);
  moveArmies(state, pid, nerve, dispatch);
  proactiveDiplomacy(state, pid, persona, dispatch);

  endTurn();
  return effects;
}

// -------------------------------------------------------------- responses

function respondToProposals(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const mine = state.proposals.filter((p) => p.to === pid);
  for (const proposal of mine) {
    const attitude = attitudeOf(state, pid, proposal.from).total;
    const myPower = totalPower(state, pid);
    const theirPower = totalPower(state, proposal.from);
    const persona = lordOf(state.players[pid]).personality;
    let accept = false;
    switch (proposal.kind) {
      case 'peace': {
        const losing = myPower < theirPower * 0.75;
        const wearBoth = state.turn - (deedTurn(state, pid, proposal.from, 'declaredWar') ?? state.turn) > 6;
        const sweetened = proposal.gold >= 40;
        accept = losing || sweetened || (wearBoth && attitude > -25) || (attitude > 0 && !persona.pride);
        if (myPower > theirPower * 1.25 && persona.aggression > 0.35) accept = false; // presses the advantage
        if (persona.pride > 0.8 && myPower > theirPower * 1.3) accept = false; // smells victory
        break;
      }
      case 'pact':
        accept = attitude >= 8 && !(persona.aggression > 0.7 && theirPower < myPower * 0.7);
        break;
      case 'alliance':
        accept = attitude >= 25;
        break;
      case 'demand': {
        const afford = proposal.gold <= state.players[pid].gold * 0.4;
        accept = theirPower > myPower * 1.5 && afford && persona.pride < 0.75;
        break;
      }
      case 'joinWar': {
        const against = proposal.target;
        if (against === undefined || !state.players[against].alive) { accept = false; break; }
        // never against a lord we are sworn to — that road is oathbreaking
        const bond = getStance(state, pid, against);
        if (bond === 'pact' || bond === 'alliance') { accept = false; break; }
        const attToTarget = attitudeOf(state, pid, against).total;
        const targetPower = totalPower(state, against);
        const targetShare = provincesOf(state, against).length / state.provinces.length;
        const hopeless = targetPower > (myPower + theirPower) * 1.4;
        const menaced = targetShare > 0.38 || attToTarget <= -15;
        // weigh what the proposer can actually PAY, not what they promised
        const realBribe = Math.min(proposal.gold, state.players[proposal.from].gold);
        const bought = realBribe >= 40 && persona.greed > 0.45 && attToTarget <= 0;
        accept = !hopeless
          && attitude >= 0
          && (menaced || bought || (attToTarget <= -8 && persona.aggression > 0.5));
        break;
      }
      default:
        accept = false;
    }
    dispatch({ t: 'respond', proposalId: proposal.id, accept });
  }
}

function deedTurn(state: GameState, viewer: PlayerId, about: PlayerId, id: string): number | undefined {
  const deeds = state.deeds[`${viewer}>${about}`] ?? [];
  return deeds.find((d) => d.id === id)?.turn;
}

// -------------------------------------------------------------------- tax

function setTaxPolicy(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  const provinces = provincesOf(state, pid);
  if (provinces.length === 0) return;
  const avgOrder = provinces.reduce((s, p) => s + p.order, 0) / provinces.length;
  const report = incomeReport(state, pid);
  const persona = lordOf(player).personality;
  let want: typeof player.tax = 'fair';
  if (avgOrder < 42) want = 'light';
  else if (report.net < 0 || (persona.greed > 0.7 && avgOrder > 62)) want = 'harsh';
  else if (avgOrder > 75 && persona.greed > 0.4) want = 'harsh';
  // golden-age pursuit needs order above the threshold more than it needs coin
  if (pursuesGoldenAge(state, pid) && avgOrder < 72 && report.net > 8) want = 'light';
  if (want !== player.tax) dispatch({ t: 'setTax', level: want });
}

// ------------------------------------------------------------------ court

function hireFromCourt(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  const persona = lordOf(player).personality;
  const heroes = heroesOf(state, pid);
  const wantHeroes = 2 + (persona.mysticism > 0.6 ? 1 : 0) + (state.turn > 15 ? 1 : 0);
  if (heroes.length >= wantHeroes) return;
  const report = incomeReport(state, pid);
  let bestIdx = -1;
  let bestScore = 0;
  player.courtOffers.forEach((offer, idx) => {
    if (offer.cost > player.gold - 120 || report.net < offer.level * 6) return;
    let score = offer.might + offer.lore + offer.guile + offer.leadership + offer.level * 2;
    if (offer.cls === 'magus') score *= 0.7 + persona.mysticism;
    if (offer.cls === 'champion') score *= 0.7 + persona.aggression * 0.6;
    if (offer.cls === 'shade') score *= 0.6 + (creedOf(player) === 'umbra' ? 0.6 : 0.15);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  if (bestIdx >= 0) dispatch({ t: 'hireHero', offerIdx: bestIdx });
}

// ------------------------------------------------------------------ build

function buildSomething(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  // late golden-age pursuit: the hoard itself is the project
  if (pursuesGoldenAge(state, pid) && player.gold > 600) return;
  const report = incomeReport(state, pid);
  const reserve = Math.max(80, (report.upkeep + report.wages) * 1.2);
  if (player.gold < reserve + 70) return;
  const persona = lordOf(player).personality;
  const provinces = provincesOf(state, pid);
  const hasBarracksSomewhere = provinces.some((p) => p.buildings.includes('barracks'));

  let best: { province: Province; building: (typeof BUILD_ORDER)[number]; score: number } | null = null;
  for (const p of provinces) {
    if (p.buildQueue) continue;
    for (const b of BUILD_ORDER) {
      const def = BUILDINGS[b];
      if (p.buildings.includes(b)) continue;
      if (def.requires && !p.buildings.includes(def.requires)) continue;
      if (def.terrain && !def.terrain.includes(p.terrain)) continue;
      if (def.coastalOnly && !p.coastal) continue;
      const { cost } = buildingCostFor(state, pid, b);
      if (cost > player.gold - reserve) continue;

      let score = 0;
      if (def.incomeAdd) score += def.incomeAdd * 2.2 * (0.8 + persona.greed);
      if (def.incomeMult) score += def.incomeMult * 55 * (0.8 + persona.greed);
      if (b === 'temple') score += p.order < 45 ? 26 : p.order < 60 ? 10 : 2;
      if (b === 'roads') score += provinces.length > 3 ? 8 : 3;
      if (def.defense) {
        const frontier = isFrontier(state, p);
        score += frontier ? def.defense * 40 * (1.3 - persona.aggression) : 2;
        if (p.seatOf === pid) score += 10;
      }
      if (b === 'barracks') score += hasBarracksSomewhere ? 4 : 24;
      if (b === 'warcamp') score += report.net > 40 && state.turn > 8 ? 18 : 2;
      if (b === 'mageTower') {
        score += 6 + persona.mysticism * 18 + (p.site === 'embersite' ? 14 : 0);
      }
      if (b === 'harbor') score += 8;
      score /= Math.sqrt(cost / 60);
      if (!best || score > best.score) best = { province: p, building: b, score };
    }
  }
  if (best && best.score > 6) {
    dispatch({ t: 'build', province: best.province.id, building: best.building });
  }
}

function isFrontier(state: GameState, p: Province): boolean {
  return p.neighbors.some((n) => {
    const np = state.provinces[n];
    if (np.owner === p.owner) return false;
    if (np.owner === NEUTRAL) return armiesIn(state, n).length > 0;
    return atWar(state, p.owner, np.owner) || attitudeOf(state, p.owner, np.owner).total < -20;
  });
}

// ---------------------------------------------------------------- recruit

function recruitTroops(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  // a golden-age hoard grows in coffers, not in barracks — muster only
  // if genuinely menaced
  if (pursuesGoldenAge(state, pid) && player.gold > 350) {
    const menace = strongestThreat(state, pid);
    if (menace < totalPower(state, pid) * 1.1) return;
  }
  const report = incomeReport(state, pid);
  const persona = lordOf(player).personality;
  const myPower = totalPower(state, pid);
  const threat = strongestThreat(state, pid);
  const myProvinces = provincesOf(state, pid);
  // a realm with an open frontier keeps mustering; a threatened realm matches its threat
  const frontierPull = myProvinces.reduce((n, p) => n + p.neighbors.filter((nb) => state.provinces[nb].owner !== pid).length, 0);
  const wantPower = Math.max(
    threat * (0.85 + persona.aggression * 0.45) + 8,
    12 + myProvinces.length * 3 + Math.min(24, frontierPull * 2.5),
  );
  const difficulty = player.difficulty ?? 'knight';
  const budgetMult = difficulty === 'warlord' ? 1.15 : difficulty === 'squire' ? 0.8 : 1;
  if (myPower >= wantPower) return;
  if (report.net < 8) return; // don't recruit into insolvency

  let spendable = Math.max(0, (player.gold - Math.max(100, report.upkeep * 1.2)) * 0.7 * budgetMult);
  const provinces = provincesOf(state, pid).filter((p) => !p.recruitQueue);
  // prefer mustering at the frontier seat-side
  provinces.sort((a, b) => Number(isFrontier(state, b)) - Number(isFrontier(state, a)));
  for (const p of provinces) {
    if (spendable < 30) break;
    const options = RECRUITABLE.filter((id) => canRecruitHere(state, pid, p, id));
    if (options.length === 0) continue;
    const pick = bestUnitFor(state, pid, options, spendable);
    if (!pick) continue;
    const { cost } = unitCostFor(state, pid, pick);
    if (dispatch({ t: 'recruit', province: p.id, unit: pick })) {
      spendable -= cost;
    }
  }
}

function canRecruitHere(state: GameState, pid: PlayerId, p: Province, unit: UnitTypeId): boolean {
  const def = UNITS[unit];
  if (!def.recruit) return false;
  const fx = lordOf(state.players[pid]).perk.fx;
  if (def.recruit.building && !p.buildings.includes(def.recruit.building)) return false;
  if (def.recruit.terrain && !def.recruit.terrain.includes(p.terrain)) {
    if (!(unit === 'cragguard' && fx.cragguardInHills && p.terrain === 'hills')) return false;
  }
  if (def.recruit.creed && creedOf(state.players[pid]) !== def.recruit.creed) return false;
  if (unit === 'revenants' && (!fx.revenantsAtBarrows || p.site !== 'barrow')) return false;
  return true;
}

function bestUnitFor(state: GameState, pid: PlayerId, options: UnitTypeId[], spendable: number): UnitTypeId | null {
  let best: UnitTypeId | null = null;
  let bestValue = 0;
  for (const id of options) {
    const def = UNITS[id];
    const { cost } = unitCostFor(state, pid, id);
    if (cost > spendable || cost === 0) continue;
    // combat value per coin, weighted toward higher tiers late
    const value = ((def.atk + def.def) * def.hits) / cost * (1 + def.tier * 0.25 * Math.min(1, state.turn / 12));
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  }
  return best;
}

// ----------------------------------------------------------------- heroes

function marshalHeroes(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const heroes = heroesOf(state, pid).filter((h) => h.status === 'ready' && h.armyId === null);
  if (heroes.length === 0) return;
  const armies = armiesOf(state, pid)
    .filter((a) => a.heroIds.length < 3)
    .sort((a, b) => roughArmyPower(b) - roughArmyPower(a));
  for (const hero of heroes) {
    const target = armies.find((a) => a.heroIds.length === 0);
    if (!target) break; // spare heroes stay at court for quests
    if (state.provinces[target.province].owner === pid || hero.province === target.province) {
      dispatch({ t: 'attachHero', heroId: hero.id, armyId: target.id });
    }
  }
}

// ------------------------------------------------- events, skills, gear

function respondToEvents(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const rng = new Rng(state.rng).fork(`ai-events-${pid}-${state.turn}`);
  aiResolveEvents(state, rng, pid, (eventId, idx) => {
    dispatch({ t: 'eventChoice', eventId, choiceIdx: idx });
  });
}

function scoreFx(state: GameState, pid: PlayerId, cls: string, fx: ArtifactFx): number {
  const persona = lordOf(state.players[pid]).personality;
  const statW: Record<string, { might: number; lore: number; guile: number; leadership: number }> = {
    champion: { might: 3, lore: 0.3, guile: 0.8, leadership: 2.2 },
    magus: { might: 0.5, lore: 3, guile: 1, leadership: 1 },
    warden: { might: 1.5, lore: 0.8, guile: 2.2, leadership: 1.8 },
    shade: { might: 1.2, lore: 0.8, guile: 3, leadership: 0.4 },
  };
  const w = statW[cls] ?? statW.champion;
  let score = 0;
  score += (fx.might ?? 0) * w.might + (fx.lore ?? 0) * w.lore + (fx.guile ?? 0) * w.guile + (fx.leadership ?? 0) * w.leadership;
  score += (fx.deathSave ?? 0) * 14;
  score += (fx.armyPowerPct ?? 0) * 1.6;
  score += (fx.questAdd ?? 0) * (cls === 'warden' || cls === 'shade' ? 2 : 1);
  score += ((fx.xpMult ?? 1) - 1) * 8;
  score += (fx.spellDiscountPct ?? 0) * 0.2 * (1 + persona.mysticism);
  score += (fx.orderAura ?? 0) * 1.5 + (fx.dreadAura ?? 0) * 1.2;
  score += (fx.emberlight ?? 0) * (1 + persona.mysticism * 2);
  return score;
}

function chooseSkills(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  for (const hero of heroesOf(state, pid)) {
    if (hero.levelChoices.length === 0) continue;
    let best = hero.levelChoices[0];
    let bestScore = -Infinity;
    for (const id of hero.levelChoices) {
      const skill = SKILLS[id];
      if (!skill) continue;
      const score = scoreFx(state, pid, hero.cls, skill.fx);
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    dispatch({ t: 'chooseSkill', heroId: hero.id, skill: best });
  }
}

function equipArtifacts(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  if (player.vault.length === 0) return;
  const heroes = heroesOf(state, pid)
    .filter((h) => h.status !== 'questing')
    .sort((a, b) => b.level - a.level);
  for (const hero of heroes) {
    for (const slot of ['weapon', 'armor', 'trinket'] as const) {
      const currentId = hero.artifacts[slot];
      const currentScore = currentId !== null
        ? scoreFx(state, pid, hero.cls, ARTIFACTS[state.artifacts[currentId]?.defId ?? '']?.fx ?? {})
        : 0;
      let bestId: number | null = null;
      let bestScore = currentScore;
      for (const artId of player.vault) {
        const inst = state.artifacts[artId];
        const def = inst ? ARTIFACTS[inst.defId] : undefined;
        if (!def || def.slot !== slot) continue;
        const score = scoreFx(state, pid, hero.cls, def.fx);
        if (score > bestScore + 0.5) {
          bestScore = score;
          bestId = artId;
        }
      }
      if (bestId !== null) {
        dispatch({ t: 'equip', heroId: hero.id, artifactId: bestId, slot });
      }
    }
  }
}

// ---------------------------------------------------- quests & the saga

function runQuests(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  const persona = lordOf(player).personality;
  const spare = () => heroesOf(state, pid).filter((h) => h.status === 'ready' && h.armyId === null);

  // the Saga first: it is a victory path, and it waits for no one
  const saga = sagaAvailable(state, pid);
  if (saga) {
    const wantSaga = persona.mysticism > 0.45 || player.sagaChapter > 0 || state.turn > 16;
    if (wantSaga) {
      const candidates = heroesOf(state, pid).filter((h) => {
        if (h.status !== 'ready' || h.level < (saga.def.minLevel ?? 1)) return false;
        const d = heroDerived(state, h);
        // the Saga is a throne: worth chancing at even odds
        return d[saga.def.stat] + h.level * 0.5 + d.questAdd + 5 - saga.def.dc >= 0;
      });
      if (candidates.length > 0) {
        let hero = candidates.reduce((a, b) =>
          heroDerived(state, b)[saga.def.stat] > heroDerived(state, a)[saga.def.stat] ? b : a,
        );
        // chapter 5 needs the Emberheart equipped on the quester — OUR heart,
        // wherever it sits: with its bearer if they can go, else reclaimed
        if (saga.def.saga === 5) {
          const isHeart = (id: number | null) => id !== null && state.artifacts[id]?.defId === 'emberheart';
          const bearer = heroesOf(state, pid).find((hh) =>
            isHeart(hh.artifacts.weapon) || isHeart(hh.artifacts.armor) || isHeart(hh.artifacts.trinket));
          if (bearer && candidates.includes(bearer)) {
            hero = bearer;
          } else {
            if (bearer) {
              const slot = isHeart(bearer.artifacts.weapon) ? 'weapon' : isHeart(bearer.artifacts.armor) ? 'armor' : 'trinket';
              dispatch({ t: 'unequip', heroId: bearer.id, slot });
            }
            const heartInst = Object.values(state.artifacts).find((a) => a.defId === 'emberheart' && player.vault.includes(a.id));
            if (heartInst) {
              dispatch({ t: 'equip', heroId: hero.id, artifactId: heartInst.id, slot: 'trinket' });
            }
          }
        }
        const venue = saga.venues.find((v) => state.provinces[v].owner === pid) ?? saga.venues[0];
        if (dispatch({ t: 'startQuest', heroId: hero.id, questDefId: saga.def.id, province: venue })) {
          return; // one great undertaking per season
        }
      }
    }
  }

  for (const hero of spare()) {
    const offers = state.questOffers[pid] ?? [];
    let best: { defId: string; province: number; score: number } | null = null;
    for (const offer of offers) {
      const def = QUESTS[offer.defId];
      if (!def) continue;
      if (def.minLevel && hero.level < def.minLevel) continue;
      if (def.tier === 3 && hero.level < 4) continue;
      const d = heroDerived(state, hero);
      const margin = questStat(d, def.stat) + hero.level * 0.5 + d.questAdd - def.dc + 5; // + expected fortune
      if (margin < 0.5) continue; // long odds are for ballads, not policy
      const score = margin + def.tier * 1.5;
      if (!best || score > best.score) best = { defId: offer.defId, province: offer.province, score };
    }
    if (best) {
      dispatch({ t: 'startQuest', heroId: hero.id, questDefId: best.defId, province: best.province });
    }
  }
}

// ------------------------------------------------------------ emberlight

function runMagic(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  const persona = lordOf(player).personality;

  // learn: keep a rite going
  if (!player.rite && player.riteOffers.length > 0) {
    const pick = player.riteOffers.reduce((a, b) => {
      const wa = riteWeight(state, pid, a, persona.aggression);
      const wb = riteWeight(state, pid, b, persona.aggression);
      return wb > wa ? b : a;
    });
    dispatch({ t: 'startRite', spellId: pick });
  }
  // pledge: keep a casting reserve, feed the rest to the rite
  if (player.rite) {
    const reserve = 12;
    const pledge = Math.min(player.emberlight - reserve, player.rite.cost - player.rite.paid);
    if (pledge > 0) dispatch({ t: 'pledgeEmberlight', amount: pledge });
  }

  // cast: two workings a season at most
  let casts = 0;
  const cast = (a: Action): void => {
    if (casts < 2 && dispatch(a)) casts++;
  };
  const knows = (id: (typeof player.spells)[number]) => player.spells.includes(id) &&
    (player.spellCooldowns[id] ?? 0) === 0 && player.emberlight >= spellCostFor(state, pid, id);

  const mine = provincesOf(state, pid);
  if (knows('quenchling')) {
    const angry = mine.find((p) => p.order < 30);
    if (angry) cast({ t: 'castSpell', spell: 'quenchling', province: angry.id });
  }
  if (knows('blessHarvest')) {
    const dull = mine.filter((p) => p.order < 60).sort((a, b) => b.prosperity - a.prosperity)[0];
    if (dull) cast({ t: 'castSpell', spell: 'blessHarvest', province: dull.id });
  }
  const enemies = state.players.filter((o) => o.alive && o.id !== pid && atWar(state, pid, o.id));
  if (enemies.length > 0) {
    if (knows('wardOfEmbers')) {
      const frontier = mine.find((p) => isFrontier(state, p) && !p.mods.some((m) => m.label === 'Ward of Embers'));
      if (frontier) cast({ t: 'castSpell', spell: 'wardOfEmbers', province: frontier.id });
    }
    if (knows('sowDiscord')) {
      const target = state.provinces
        .filter((p) => p.owner >= 0 && enemies.some((e) => e.id === p.owner))
        .sort((a, b) => b.prosperity - a.prosperity)[0];
      if (target) cast({ t: 'castSpell', spell: 'sowDiscord', province: target.id });
    }
    if (knows('barrowCall')) {
      const barrow = mine.find((p) => p.site === 'barrow');
      if (barrow) cast({ t: 'castSpell', spell: 'barrowCall', province: barrow.id });
    }
  }
  if (knows('emberTithe') && player.emberlight < 8 && player.gold > 400) {
    cast({ t: 'castSpell', spell: 'emberTithe' });
  }
}

function riteWeight(state: GameState, pid: PlayerId, id: (typeof SPELLS)[keyof typeof SPELLS]['id'], aggression: number): number {
  const def = SPELLS[id];
  const creed = creedOf(state.players[pid]);
  let w = 2;
  if (def.creedAffinity === creed) w += 2;
  if (def.kind === 'battle') w += aggression * 2;
  else w += (1 - aggression) * 1.5;
  w -= def.riteCost / 40;
  return w;
}

// ----------------------------------------------------------------- armies

/** The merchant's road to the throne: low-aggression, high-greed lords with
 * a quiet realm start playing for the Golden Age — hoarding, defending,
 * declining wars. This makes the economic ending a real presence at the
 * table instead of an advertised impossibility. */
export function pursuesGoldenAge(state: GameState, pid: PlayerId): boolean {
  if (!state.victory.paths.includes('goldenAge')) return false;
  const player = state.players[pid];
  if (player.kind !== 'ai' || !player.alive) return false;
  const persona = lordOf(player).personality;
  if (!(persona.greed >= 0.55 && persona.aggression <= 0.5)) return false;
  if (state.turn < 18) return false;
  if (provincesOf(state, pid).length < 3) return false;
  return !state.players.some((o) => o.alive && o.id !== pid && atWar(state, pid, o.id));
}

function attackNerve(state: GameState, pid: PlayerId): number {
  const player = state.players[pid];
  const persona = lordOf(player).personality;
  let threshold = 0.66 - persona.aggression * 0.18;
  if (player.difficulty === 'warlord') threshold -= 0.05;
  if (player.difficulty === 'squire') threshold += 0.08;
  if (state.turn < 12) threshold -= 0.06; // the land-grab years
  if (state.turn > 30) threshold -= 0.04; // the chronicle shortens; boldness pays
  // once the league has formed, everyone but the leader fights braver
  const lead = leaderId(state);
  if (state.victory.coalitionTurn !== null && lead !== null && lead !== pid) {
    const share = provincesOf(state, lead).length / state.provinces.length;
    if (share >= 0.34) threshold -= 0.05;
  }
  return threshold;
}

/** Same-province stacks merge; scattered dribs consolidate on the main banner. */
function consolidateArmies(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  for (let guard = 0; guard < 12; guard++) {
    const armies = armiesOf(state, pid);
    let merged = false;
    const byProvince = new Map<number, Army[]>();
    for (const a of armies) {
      const list = byProvince.get(a.province) ?? [];
      list.push(a);
      byProvince.set(a.province, list);
    }
    for (const list of byProvince.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => roughArmyPower(b) - roughArmyPower(a));
      const [into, from] = [list[0], list[1]];
      if (into.units.length + from.units.length <= 12 && into.heroIds.length + from.heroIds.length <= 3) {
        if (dispatch({ t: 'mergeArmies', from: from.id, into: into.id })) {
          merged = true;
          break;
        }
      }
    }
    if (!merged) return;
  }
}

function moveArmies(state: GameState, pid: PlayerId, nerve: number, dispatch: (a: Action) => boolean): void {
  // consider strongest armies first; re-read the map after every move.
  // NB: "holding" is tracked locally — state is only ever touched via actions.
  const held = new Set<number>();
  for (let guard = 0; guard < 24; guard++) {
    const armies = armiesOf(state, pid)
      .filter((a) => !a.moved && !held.has(a.id) && a.units.length > 0)
      .sort((a, b) => roughArmyPower(b) - roughArmyPower(a));
    if (armies.length === 0) return;
    const army = armies[0];
    if (!actWithArmy(state, pid, army, nerve, dispatch)) {
      held.add(army.id); // stands guard this season
    }
  }
}

function actWithArmy(state: GameState, pid: PlayerId, army: Army, nerve: number, dispatch: (a: Action) => boolean): boolean {
  const targets = moveTargets(state, army);
  if (targets.length === 0) return false;
  const persona = lordOf(state.players[pid]).personality;
  const lead = leaderId(state);

  // dribs and drabs rally to the main banner instead of dying alone
  const strongest = armiesOf(state, pid).reduce((a, b) => (roughArmyPower(b) > roughArmyPower(a) ? b : a), army);
  if (strongest.id !== army.id && roughArmyPower(army) < roughArmyPower(strongest) * 0.5 && army.units.length < 9) {
    if (strongest.province !== army.province) {
      const step = stepToward(state, army, strongest.province);
      if (step !== null) {
        const t = targets.find((t2) => t2.to === step && !t2.hostile);
        if (t) return dispatch({ t: 'moveArmy', armyId: army.id, to: t.to, viaSea: t.viaSea });
      }
    }
  }

  // 1) fight: score hostile targets by preview odds x prize.
  // When a lone banner lacks the nerve, sound the horns: a combined assault
  // with nearby unmoved banners may carry what one could not.
  let bestAttack: { to: number; viaSea: boolean; score: number; support: number[] } | null = null;
  const myRough = roughArmyPower(army);
  const idle = armiesOf(state, pid).filter((a) => a.id !== army.id && !a.moved && a.units.length > 0);
  for (const t of targets.filter((t2) => t2.hostile)) {
    const p = state.provinces[t.to];
    const rebelsInMyLand = p.owner === pid;
    const neutral = p.owner === NEUTRAL;
    let need = nerve;
    if (rebelsInMyLand) need -= 0.12; // put down risings with prejudice
    if (neutral) need -= 0.06; // free provinces are cheap meat
    // allies press the same front (v15): a shared enemy's province with an
    // allied banner beside it is both safer to strike and sweeter to take —
    // two allied AIs converge instead of fighting parallel private wars
    const allyBeside = p.owner >= 0 && p.owner !== pid && state.players.some((al) =>
      al.alive && al.id !== pid
      && getStance(state, pid, al.id) === 'alliance'
      && atWar(state, al.id, p.owner)
      && armiesOf(state, al.id).some((a2) => a2.province === p.id || p.neighbors.includes(a2.province)));
    if (allyBeside) need -= 0.07;

    // supports that could join this particular assault
    const possibleSupport = idle
      .filter((a) => moveTargets(state, a).some((mt) => mt.to === t.to && mt.hostile))
      .sort((a, b) => roughArmyPower(b) - roughArmyPower(a))
      .slice(0, 2);

    const defRough = armiesIn(state, t.to)
      .filter((a) => a.owner !== pid)
      .reduce((s, a) => s + roughArmyPower(a), 0);
    const combinedRough = myRough + possibleSupport.reduce((s, a) => s + roughArmyPower(a), 0);
    if (defRough > combinedRough * 1.7) continue;

    let preview = previewBattle(state, army.id, t.to, t.viaSea, 60);
    if (!preview) continue;
    let support: number[] = [];
    if (preview.winChance < need && possibleSupport.length > 0 && !rebelsInMyLand) {
      const joint = previewBattle(state, army.id, t.to, t.viaSea, 60, possibleSupport.map((a) => a.id));
      if (joint && joint.winChance >= need && joint.winChance > preview.winChance + 0.08) {
        preview = joint;
        support = possibleSupport.map((a) => a.id);
      }
    }
    if (preview.winChance < need) continue;
    let prize = neutral || rebelsInMyLand ? 16 : 24;
    if (allyBeside) prize += 6; // the front our ally already bleeds on
    if (p.site) prize += 6;
    if (p.terrain === 'meadow') prize += 5;
    if (p.seatOf !== null && p.seatOf !== pid) prize += 18;
    if (p.owner === lead && lead !== pid) prize += 8; // clip the leader's wings
    if (p.owner >= 0 && creedOf(state.players[p.owner]) === 'umbra' && creedOf(state.players[pid]) === 'flame') prize += 4;
    // a rival's Rekindling burns on that ground: breaking it is worth blood
    const ritualThere = state.activeQuests.some((q) =>
      q.province === p.id && q.owner !== pid && QUESTS[q.defId]?.saga === 5);
    if (ritualThere) prize += 40;
    let score = preview.winChance * prize - preview.aExpectedLoss * 20 * (1 - persona.aggression * 0.5);
    if (support.length > 0) score -= 3; // committing several banners costs tempo
    if (!bestAttack || score > bestAttack.score) bestAttack = { to: t.to, viaSea: t.viaSea, score, support };
  }
  if (bestAttack && bestAttack.score > 2) {
    return dispatch({
      t: 'moveArmy', armyId: army.id, to: bestAttack.to, viaSea: bestAttack.viaSea,
      ...(bestAttack.support.length > 0 ? { support: bestAttack.support } : {}),
    });
  }

  // 2) defend: reinforce an owned frontier province in danger
  const danger = provincesOf(state, pid)
    .filter((p) => p.id !== army.province && isFrontier(state, p))
    .map((p) => ({ p, gap: threatAgainst(state, p) - garrisonPower(state, p) }))
    .filter((d) => d.gap > 6)
    .sort((a, b) => b.gap - a.gap);
  if (danger.length > 0) {
    const step = stepToward(state, army, danger[0].p.id);
    if (step !== null) {
      const t = targets.find((t2) => t2.to === step && !t2.hostile);
      if (t) return dispatch({ t: 'moveArmy', armyId: army.id, to: t.to, viaSea: t.viaSea });
    }
  }

  // 3) march toward the nearest worthwhile frontier
  const frontierIds = state.provinces
    .filter((p) => p.owner === pid && isFrontier(state, p))
    .map((p) => p.id);
  if (frontierIds.length > 0 && !frontierIds.includes(army.province)) {
    const step = stepToward(state, army, frontierIds[0]);
    if (step !== null) {
      const t = targets.find((t2) => t2.to === step && !t2.hostile);
      if (t) return dispatch({ t: 'moveArmy', armyId: army.id, to: t.to, viaSea: t.viaSea });
    }
  }
  return false;
}

function stepToward(state: GameState, army: Army, dest: number): number | null {
  // BFS through provinces the army could plausibly traverse (own or neutral-empty)
  const pid = army.owner;
  const passable = (id: number): boolean => {
    const p = state.provinces[id];
    if (p.owner === pid) return !armiesIn(state, id).some((a) => a.owner !== pid && a.owner !== NEUTRAL);
    return false;
  };
  const prev = new Map<number, number>();
  const queue = [army.province];
  const seen = new Set([army.province]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of state.provinces[cur].neighbors) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === dest) {
        // walk back to the first step
        let step = n;
        while (prev.get(step) !== undefined && prev.get(step) !== army.province) {
          step = prev.get(step)!;
        }
        return step;
      }
      if (passable(n)) queue.push(n);
    }
  }
  return null;
}

function garrisonPower(state: GameState, p: Province): number {
  return armiesIn(state, p.id)
    .filter((a) => a.owner === p.owner)
    .reduce((s, a) => s + roughArmyPower(a), 0);
}

function threatAgainst(state: GameState, p: Province): number {
  let threat = 0;
  for (const n of p.neighbors) {
    for (const a of armiesIn(state, n)) {
      if (a.owner === p.owner) continue;
      if (a.owner === NEUTRAL && a.kind) threat += roughArmyPower(a) * 0.6;
      else if (a.owner >= 0 && atWar(state, p.owner, a.owner)) threat += roughArmyPower(a);
      else if (a.owner >= 0 && attitudeOf(state, p.owner, a.owner).total < -30) threat += roughArmyPower(a) * 0.4;
    }
  }
  return threat;
}

function totalPower(state: GameState, pid: PlayerId): number {
  return armiesOf(state, pid).reduce((s, a) => s + roughArmyPower(a), 0);
}

/** Fire the lord's signature when its moment is genuinely here — each lord
 * reads a different moment, so rivals learn twelve rhythms, not one. */
function maybeUseSignature(state: GameState, pid: PlayerId, dispatch: (a: Action) => boolean): void {
  const player = state.players[pid];
  if ((player.signatureCooldownLeft ?? 0) > 0) return;
  const lord = lordOf(player);
  const mine = provincesOf(state, pid);
  if (mine.length === 0) return;
  const atWarWith = state.players.filter((o) => o.alive && o.id !== pid && atWar(state, pid, o.id));
  const warTarget = atWarWith.length > 0
    ? atWarWith.reduce((a, b) => (totalPower(state, b.id) > totalPower(state, a.id) ? b : a))
    : null;
  const use = (action?: Partial<Action & { t: 'signature' }>): boolean =>
    dispatch({ t: 'signature', ...action });

  switch (lord.id) {
    case 'seraphine': {
      // v12: her old gate (avg < 55) almost never opened — her own perk keeps
      // order high. The Vigil now also pays and heals conquest grief, so she
      // calls it whenever the realm is merely unsettled or freshly enlarged.
      const avg = mine.reduce((s, p) => s + p.order, 0) / mine.length;
      if (avg < 68 || mine.some((p) => p.order < 40) || mine.some((p) => p.capturedTurn > 0)) use();
      break;
    }
    case 'aldric': {
      // muster when a war is on and the seat is his to call from
      if (warTarget && state.provinces[player.seatProvince].owner === pid) use();
      break;
    }
    case 'halvard': {
      // a real siege coming, not every wandering rebel band: hostile armies
      // of a lord he is at war with beside his land, or rebels inside it —
      // or (v12) a war of his own to finish, sallying from the standing wall
      const threatened = mine.some((p) =>
        armiesIn(state, p.id).some((a) => a.owner === NEUTRAL)
        || p.neighbors.some((n) =>
          armiesIn(state, n).some((a) => a.owner >= 0 && a.owner !== pid && atWar(state, pid, a.owner))));
      if (threatened || (warTarget && armiesOf(state, pid).some((a) => !a.moved))) use();
      break;
    }
    case 'lyra': {
      if (warTarget) use({ targetPlayer: warTarget.id });
      break;
    }
    case 'ulvra': {
      // the roads open when she has fresh armies and a war to march to
      if (warTarget && armiesOf(state, pid).some((a) => !a.moved)) use();
      break;
    }
    case 'maera': {
      if (warTarget || (state.settings.fogOfWar && state.turn >= 8)) use();
      break;
    }
    case 'cormac': {
      // the wood marches whenever he fights and holds any of it
      if (warTarget && mine.some((p) => p.terrain === 'forest')) use();
      break;
    }
    case 'branwen': {
      // embargo the richest lord she is at war with, or a hated richer rival
      const candidates = state.players.filter((o) => o.alive && o.id !== pid
        && (atWar(state, pid, o.id) || (attitudeOf(state, pid, o.id).total < -20 && o.gold > player.gold)));
      if (candidates.length > 0) {
        const richest = candidates.reduce((a, b) => (b.gold > a.gold ? b : a));
        if (richest.gold >= 120) use({ targetPlayer: richest.id });
      }
      break;
    }
    case 'corvas': {
      const rivals = state.players.filter((o) => o.alive && o.id !== pid);
      const pctEff = 0.06 / Math.sqrt(Math.max(1, rivals.length - 1));
      const takings = rivals.reduce((s, o) => s + Math.floor(o.gold * pctEff), 0);
      if (takings >= 15) use();
      break;
    }
    case 'nyssa': {
      // the softest bordering enemy province, pushed toward the brink
      let best: Province | null = null;
      for (const p of state.provinces) {
        if (p.owner < 0 || p.owner === pid) continue;
        if (!p.neighbors.some((n) => state.provinces[n].owner === pid)) continue;
        if (!atWar(state, pid, p.owner) && attitudeOf(state, pid, p.owner).total > -10) continue;
        if (!best || p.order < best.order) best = p;
      }
      if (best && best.order < 55) use({ province: best.id });
      break;
    }
    case 'morrikan': {
      // barrows make it strong; the seat fallback (v12) keeps it alive on
      // seeds that never hand him one — but the doors open for wars and the
      // long middle of the age, not as a free standing army subscription
      if (warTarget || state.turn >= 12) use();
      break;
    }
    case 'vaelia': {
      if (warTarget) use({ targetPlayer: warTarget.id });
      break;
    }
    default:
      break;
  }
}

function strongestThreat(state: GameState, pid: PlayerId): number {
  let strongest = 0;
  for (const other of state.players) {
    if (other.id === pid || !other.alive) continue;
    const borders = provincesOf(state, pid).some((p) =>
      p.neighbors.some((n) => state.provinces[n].owner === other.id),
    );
    if (!borders && getStance(state, pid, other.id) !== 'war') continue;
    const power = totalPower(state, other.id);
    const hostileWeight = getStance(state, pid, other.id) === 'war' ? 1 : attitudeOf(state, pid, other.id).total < -20 ? 0.8 : 0.55;
    strongest = Math.max(strongest, power * hostileWeight);
  }
  return strongest;
}

// -------------------------------------------------------------- diplomacy

function proactiveDiplomacy(
  state: GameState,
  pid: PlayerId,
  persona: ReturnType<typeof lordOf>['personality'],
  dispatch: (a: Action) => boolean,
): void {
  const player = state.players[pid];
  const myPower = totalPower(state, pid);
  const lead = leaderId(state);
  const atWarWith = state.players.filter((o) => o.alive && o.id !== pid && atWar(state, pid, o.id));

  // sue for peace when a war is plainly lost
  for (const enemy of atWarWith) {
    const theirPower = totalPower(state, enemy.id);
    const losingBadly = myPower < theirPower * 0.55;
    const exhausted = myPower < theirPower * 0.8 && atWarWith.length > 1;
    if (losingBadly || exhausted) {
      const sweetener = persona.pride > 0.7 ? 0 : Math.min(60, Math.floor(player.gold * 0.15));
      dispatch({ t: 'diplomacy', kind: 'offerPeace', target: enemy.id, gold: sweetener });
      break;
    }
  }

  // pick a war deliberately (one at a time, neighbors only) — unless the
  // realm is playing for the Golden Age, in which case war is bad business
  if (atWarWith.length === 0 && state.turn > 5 && !pursuesGoldenAge(state, pid)) {
    let bestTarget: PlayerId | null = null;
    let bestScore = 0;
    for (const other of state.players) {
      if (!other.alive || other.id === pid) continue;
      const stance = getStance(state, pid, other.id);
      if (stance === 'alliance') continue;
      const borders = provincesOf(state, pid).some((p) =>
        p.neighbors.some((n) => state.provinces[n].owner === other.id),
      );
      if (!borders) continue;
      const attitude = attitudeOf(state, pid, other.id).total;
      const theirPower = totalPower(state, other.id);
      if (myPower < theirPower * 1.15) continue;
      // land hunger: nothing free left to take makes neighbors look tastier
      const frontierLeft = provincesOf(state, pid).some((p) =>
        p.neighbors.some((n) => state.provinces[n].owner === NEUTRAL),
      );
      let score = persona.aggression * 40 - attitude * 0.5 + (myPower / Math.max(1, theirPower)) * 10;
      if (!frontierLeft) score += 18;
      if (state.players.filter((p) => p.alive).length === 2) score += 14; // a duel admits no bystanders
      if (other.id === lead && provincesOf(state, lead).length / state.provinces.length > 0.38) score += 25;
      if (stance === 'pact') score -= persona.loyalty * 60; // oathbreaking weighs
      const attitudeGate = persona.loyalty > 0.7 ? -25 : (frontierLeft ? -8 : 5);
      if (attitude > attitudeGate && other.id !== lead) continue;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = other.id;
      }
    }
    if (bestTarget !== null && bestScore > 30) {
      dispatch({ t: 'diplomacy', kind: 'declareWar', target: bestTarget });
    }
  }

  // war shopping (v15, A§5.4): a runaway leader already under someone
  // else's steel is safer meat — the fierce and the greedy pile in rather
  // than watch the realm be won. Never over a pact; never from weakness.
  if (atWarWith.length === 0 && state.turn > 8 && !pursuesGoldenAge(state, pid) && lead !== null && lead !== pid) {
    const leadShare = provincesOf(state, lead).length / state.provinces.length;
    const someoneFights = state.players.some((o) => o.alive && o.id !== pid && atWar(state, o.id, lead));
    const eager = persona.aggression >= 0.6 || persona.greed >= 0.7;
    const borders = provincesOf(state, pid).some((p) => p.neighbors.some((n) => state.provinces[n].owner === lead));
    if (leadShare >= 0.34 && someoneFights && eager && borders
      && getStance(state, pid, lead) === 'peace'
      && myPower > totalPower(state, lead) * 0.45) {
      dispatch({ t: 'diplomacy', kind: 'declareWar', target: lead });
    }
  }

  // call friends into a hard war (the scheming layer): if my enemy outweighs
  // me — or is the runaway leader — recruit the willing against them.
  if (atWarWith.length > 0) {
    const enemy = atWarWith
      .map((o) => ({ o, power: totalPower(state, o.id) }))
      .sort((a, b) => b.power - a.power)[0];
    const enemyShare = provincesOf(state, enemy.o.id).length / state.provinces.length;
    const hardWar = enemy.power > myPower * 1.05 || enemy.o.id === lead && enemyShare > 0.34;
    // one embassy per few seasons, and never to a court that just refused us
    const myTurnToAsk = state.turn % 3 === Math.abs(pid) % 3;
    if (hardWar && myTurnToAsk) {
      const recruit = state.players.find((o) => {
        if (!o.alive || o.id === pid || o.id === enemy.o.id) return false;
        if (getStance(state, pid, o.id) === 'war' || getStance(state, o.id, enemy.o.id) === 'war') return false;
        if (state.proposals.some((pr) => pr.from === pid && pr.to === o.id)) return false;
        if (deedsOf(state, pid, o.id).some((d) => d.id === 'refusedCall')) return false;
        return attitudeOf(state, pid, o.id).total >= 0 && attitudeOf(state, o.id, enemy.o.id).total <= 0;
      });
      if (recruit) {
        const sweetener = player.gold > 300 ? Math.min(60, Math.floor(player.gold * 0.12)) : 0;
        dispatch({ t: 'diplomacy', kind: 'joinWar', target: recruit.id, against: enemy.o.id, gold: sweetener });
      }
    }
  }

  // courtesies: gift a promising friend; propose pacts to steady neighbors
  if (player.gold > 400 && persona.loyalty > 0.4) {
    const friend = state.players.find((o) => {
      if (!o.alive || o.id === pid) return false;
      const att = attitudeOf(state, pid, o.id).total;
      return att > 5 && att < 40 && getStance(state, pid, o.id) !== 'war';
    });
    if (friend) {
      dispatch({ t: 'diplomacy', kind: 'gift', target: friend.id, gold: 40 });
    }
  }
  if (state.turn > 4 && state.turn % 4 === Math.abs(pid) % 4) {
    const candidate = state.players.find((o) => {
      if (!o.alive || o.id === pid) return false;
      return getStance(state, pid, o.id) === 'peace' && attitudeOf(state, pid, o.id).total >= 12;
    });
    if (candidate) {
      dispatch({ t: 'diplomacy', kind: 'offerPact', target: candidate.id });
    }
  }

  // extortion is a personality trait
  if (persona.greed > 0.75 && state.turn > 6 && atWarWith.length === 0) {
    const mark = state.players.find((o) => {
      if (!o.alive || o.id === pid) return false;
      return totalPower(state, o.id) < myPower * 0.55 && getStance(state, pid, o.id) === 'peace' && o.gold > 150;
    });
    if (mark) {
      dispatch({ t: 'diplomacy', kind: 'demand', target: mark.id, gold: Math.floor(mark.gold * 0.25) });
    }
  }
}
