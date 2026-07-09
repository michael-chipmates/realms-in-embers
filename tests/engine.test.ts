import { describe, expect, it } from 'vitest';
import { applyAction, createGame, deserializeGame, moveTargets, previewBattle, replayGame, serializeGame } from '../src/engine/engine';
import { entryKind } from '../src/engine/actions';
import { incomeReport, orderDrift, provinceIncome } from '../src/engine/economy';
import { defaultSettings } from '../src/engine/state';
import { makeUnits, newArmy } from '../src/engine/helpers';
import { EVENT_BY_ID } from '../src/engine/content/events';
import { Rng } from '../src/engine/rng';
import type { GameSettings, GameState } from '../src/engine/types';

function freshGame(seed: string, players = 3): GameState {
  const s: GameSettings = { ...defaultSettings(), seed };
  s.players = s.players.slice(0, players);
  while (s.players.length < players) s.players.push({ kind: 'ai', lordId: 'random', difficulty: 'knight' });
  return createGame(s).state;
}

/** End turns until it's `pid`'s turn AGAIN (always advances at least once). */
function cycleTo(state: GameState, pid: number): void {
  for (let i = 0; i < 24; i++) {
    const r = applyAction(state, { t: 'endTurn' });
    if (!r.ok) throw new Error(r.error);
    if (state.phase === 'ended') return;
    if (state.current === pid) return;
  }
  throw new Error(`never cycled back to player ${pid}`);
}

describe('economy', () => {
  it('income reports are itemized and internally consistent', () => {
    const state = freshGame('econ-1');
    for (const player of state.players) {
      const report = incomeReport(state, player.id);
      expect(report.net).toBe(report.gold - report.upkeep - report.wages);
      expect(report.lines.length).toBeGreaterThan(0);
      // province line items match per-province totals
      for (const p of state.provinces.filter((pp) => pp.owner === player.id)) {
        const line = report.lines.find((l) => l.label === p.name);
        expect(line).toBeDefined();
        expect(line!.amount).toBe(provinceIncome(state, p).total);
      }
    }
  });

  it('order drift is a sum of visible labeled causes', () => {
    const state = freshGame('econ-2');
    for (const p of state.provinces.filter((pp) => pp.owner >= 0)) {
      const drift = orderDrift(state, p);
      const sum = drift.lines.reduce((s, l) => s + l.amount, 0);
      expect(drift.total).toBe(sum);
      for (const line of drift.lines) expect(line.label.length).toBeGreaterThan(2);
    }
  });

  it('harsh taxes bring more gold and less order than light', () => {
    const state = freshGame('econ-3');
    const player = state.players[0];
    const seat = state.provinces[player.seatProvince];
    player.tax = 'light';
    const lightIncome = provinceIncome(state, seat).total;
    const lightDrift = orderDrift(state, seat).total;
    player.tax = 'harsh';
    const harshIncome = provinceIncome(state, seat).total;
    const harshDrift = orderDrift(state, seat).total;
    expect(harshIncome).toBeGreaterThan(lightIncome);
    expect(harshDrift).toBeLessThan(lightDrift);
  });
});

describe('build & recruit', () => {
  it('building costs gold, takes time, completes', () => {
    const state = freshGame('build-1');
    const player = state.players[0];
    const seat = state.provinces[player.seatProvince];
    const goldBefore = player.gold;
    const r = applyAction(state, { t: 'build', province: seat.id, building: 'temple' });
    expect(r.ok).toBe(true);
    expect(player.gold).toBeLessThan(goldBefore);
    expect(seat.buildQueue?.id).toBe('temple');
    const rejected = applyAction(state, { t: 'build', province: seat.id, building: 'market' });
    expect(rejected.ok).toBe(false); // builders busy
    cycleTo(state, 0);
    expect(seat.buildings).toContain('temple');
    expect(seat.buildQueue).toBeNull();
  });

  it('recruiting respects gates and delivers next turn', () => {
    const state = freshGame('recruit-1');
    const player = state.players[0];
    const seat = state.provinces[player.seatProvince];
    // knights need barracks + meadow/hills; militia works anywhere
    const bad = applyAction(state, { t: 'recruit', province: seat.id, unit: 'sunblades' });
    expect(bad.ok).toBe(false); // no warcamp
    const companiesBefore = Object.values(state.armies)
      .filter((a) => a.owner === 0)
      .reduce((n, a) => n + a.units.length, 0);
    const ok = applyAction(state, { t: 'recruit', province: seat.id, unit: 'militia' });
    expect(ok.ok).toBe(true);
    cycleTo(state, 0);
    const companiesAfter = Object.values(state.armies)
      .filter((a) => a.owner === 0)
      .reduce((n, a) => n + a.units.length, 0);
    expect(companiesAfter).toBe(companiesBefore + 1);
  });

  it('neutral provinces cannot be built in', () => {
    const state = freshGame('build-2');
    const neutral = state.provinces.find((p) => p.owner === -1)!;
    const r = applyAction(state, { t: 'build', province: neutral.id, building: 'temple' });
    expect(r.ok).toBe(false);
  });
});

describe('movement & combat', () => {
  it('previews battles without touching the rng stream', () => {
    const state = freshGame('combat-preview');
    const army = Object.values(state.armies).find((a) => a.owner === 0)!;
    const seat = state.provinces[state.players[0].seatProvince];
    const target = seat.neighbors.find((n) => state.provinces[n].owner === -1)!;
    const rngBefore = [...state.rng];
    const preview = previewBattle(state, army.id, target);
    expect(preview).not.toBeNull();
    expect(state.rng).toEqual(rngBefore);
    expect(preview!.winChance).toBeGreaterThanOrEqual(0);
    expect(preview!.winChance).toBeLessThanOrEqual(1);
    expect(preview!.dMods.length).toBeGreaterThan(0);
    // preview twice: identical (deterministic fork)
    const again = previewBattle(state, army.id, target);
    expect(again).toEqual(preview);
  });

  it('attacking a garrisoned neutral resolves a battle with a full report', () => {
    const state = freshGame('combat-1');
    const army = Object.values(state.armies).find((a) => a.owner === 0)!;
    army.units.push(...makeUnits('knights', 6));
    const seat = state.provinces[state.players[0].seatProvince];
    const target = seat.neighbors.find((n) => state.provinces[n].owner === -1)!;
    const r = applyAction(state, { t: 'moveArmy', armyId: army.id, to: target });
    expect(r.ok).toBe(true);
    const battle = r.effects.find((e) => e.e === 'battle');
    expect(battle).toBeDefined();
    if (battle && battle.e === 'battle') {
      expect(battle.report.rounds.length).toBeGreaterThan(0);
      expect(['attacker', 'defender']).toContain(battle.report.winner);
      if (battle.report.winner === 'attacker') {
        expect(state.provinces[target].owner).toBe(0);
        expect(r.effects.some((e) => e.e === 'captured')).toBe(true);
      }
    }
    // no zombie companies anywhere
    for (const a of Object.values(state.armies)) {
      expect(a.units.every((u) => u.hits > 0)).toBe(true);
      expect(a.units.length).toBeGreaterThan(0);
    }
  });

  it('peaceful borders are closed; war opens them', () => {
    const state = freshGame('combat-2', 2);
    // 2-player map: front lines exist somewhere; find any province of p1
    const p1Province = state.provinces.find((p) => p.owner === 1)!;
    expect(entryKind(state, 0, p1Province.id)).toBe('blocked');
    const r = applyAction(state, { t: 'diplomacy', kind: 'declareWar', target: 1 });
    expect(r.ok).toBe(true);
    expect(entryKind(state, 0, p1Province.id)).not.toBe('blocked');
    // war is remembered, with a reason
    const deeds = state.deeds['1>0'] ?? [];
    expect(deeds.some((d) => d.id === 'declaredWar')).toBe(true);
  });

  it('moved armies cannot move again until next turn', () => {
    const state = freshGame('combat-3');
    const army = Object.values(state.armies).find((a) => a.owner === 0)!;
    const first = moveTargets(state, army);
    expect(first.length).toBeGreaterThan(0);
    army.units.push(...makeUnits('knights', 8)); // ensure survival
    const r = applyAction(state, { t: 'moveArmy', armyId: army.id, to: first[0].to });
    expect(r.ok).toBe(true);
    if (state.armies[army.id]) {
      expect(moveTargets(state, state.armies[army.id]).length).toBe(0);
    }
    cycleTo(state, 0);
    if (state.armies[army.id]) {
      expect(moveTargets(state, state.armies[army.id]).length).toBeGreaterThan(0);
    }
  });
});

describe('event chains', () => {
  it('paying the wolfshead toll plants the return visit; buying the relic plants its homesickness', () => {
    const state = freshGame('chain-1', 2);
    const wolfshead = EVENT_BY_ID.wolfsheadReturn;
    const homesick = EVENT_BY_ID.hummingHomesick;
    // without flags, neither chain event can bind
    expect(wolfshead.when(state, 0, new Rng(state.rng))).toBeNull();
    expect(homesick.when(state, 0, new Rng(state.rng))).toBeNull();
    // with the planted flags (and a LIVING band — dead bands GC their toll), both bind
    const band = newArmy(state, -1, state.provinces.find((p) => p.owner === -1)!.id, makeUnits('marauders', 2), { kind: 'marauders' });
    state.players[0].flags[`tollPaid:${band.id}`] = true;
    state.players[0].flags.peddlerRelic = true;
    expect(wolfshead.when(state, 0, new Rng(state.rng))).not.toBeNull();
    expect(homesick.when(state, 0, new Rng(state.rng))).not.toBeNull();
    // the band dies; the arrangement dies with it
    delete state.armies[band.id];
    expect(wolfshead.when(state, 0, new Rng(state.rng))).toBeNull();
    expect(state.players[0].flags[`tollPaid:${band.id}`]).toBeUndefined();
  });
});

describe('war, peace and memory', () => {
  it('a call to war, accepted, brings the third lord into the fight', () => {
    const state = freshGame('joinwar-1', 3);
    applyAction(state, { t: 'diplomacy', kind: 'declareWar', target: 1 });
    const call = applyAction(state, { t: 'diplomacy', kind: 'joinWar', target: 2, against: 1, gold: 20 });
    expect(call.ok).toBe(true);
    const proposal = state.proposals.find((p) => p.kind === 'joinWar');
    expect(proposal?.target).toBe(1);
    cycleTo(state, 2);
    const gold2Before = state.players[2].gold;
    const respond = applyAction(state, { t: 'respond', proposalId: proposal!.id, accept: true });
    expect(respond.ok).toBe(true);
    expect(state.stances['1:2']).toBe('war');
    expect(state.players[2].gold).toBe(gold2Before + 20);
    expect((state.deeds['0>2'] ?? []).some((d) => d.id === 'answeredCall')).toBe(true);
  });

  it('calling someone into a war you are not fighting fails', () => {
    const state = freshGame('joinwar-2', 3);
    const call = applyAction(state, { t: 'diplomacy', kind: 'joinWar', target: 2, against: 1 });
    expect(call.ok).toBe(false);
  });

  it('alliances are defensive: attacking one ally brings in the other', () => {
    const state = freshGame('ally-1', 3);
    // forge an alliance between 1 and 2 by direct state (the chain is tested elsewhere)
    state.stances['1:2'] = 'alliance';
    applyAction(state, { t: 'diplomacy', kind: 'declareWar', target: 1 });
    expect(state.stances['0:1']).toBe('war');
    expect(state.stances['0:2']).toBe('war');
    expect((state.deeds['1>2'] ?? []).some((d) => d.id === 'honoredAlliance')).toBe(true);
  });

  it('combined assault: supporting banners fight, commit their season, and follow up on victory', () => {
    const state = freshGame('coattack-1', 2);
    // manufacture a clean tactical picture: two of ours adjacent to one weak enemy
    const enemyProvince = state.provinces.find((p) => p.owner === 1)!;
    const [n1, n2] = enemyProvince.neighbors;
    state.provinces[n1].owner = 0;
    state.provinces[n2].owner = 0;
    for (const a of Object.values(state.armies)) {
      if (a.owner === 0) { a.units = makeUnits('militia', 1); a.province = n1; a.moved = false; }
      if (a.owner === 1) { a.units = makeUnits('militia', 2); a.province = enemyProvince.id; }
    }
    const main = Object.values(state.armies).find((a) => a.owner === 0)!;
    const sup = newArmy(state, 0, n2, makeUnits('militia', 1));
    applyAction(state, { t: 'diplomacy', kind: 'declareWar', target: 1 });
    const res = applyAction(state, {
      t: 'moveArmy', armyId: main.id, to: enemyProvince.id, support: [sup.id],
    });
    expect(res.ok).toBe(true);
    expect(sup.moved).toBe(true);
    const report = state.battles[state.battles.length - 1];
    expect(report.aMods.some((m) => m.label.includes('Combined assault'))).toBe(true);
  });

  it('peace can be offered, accepted, and chronicled', () => {
    const state = freshGame('diplo-1', 2);
    applyAction(state, { t: 'diplomacy', kind: 'declareWar', target: 1 });
    const offer = applyAction(state, { t: 'diplomacy', kind: 'offerPeace', target: 1, gold: 50 });
    expect(offer.ok).toBe(true);
    expect(state.proposals.length).toBe(1);
    cycleTo(state, 1);
    const respond = applyAction(state, { t: 'respond', proposalId: state.proposals[0].id, accept: true });
    expect(respond.ok).toBe(true);
    expect(state.stances['0:1']).toBe('peace');
    expect(state.chronicle.some((c) => c.kind === 'diplomacy' && c.text.includes('peace'))).toBe(true);
    // both remember the honorable peace
    expect((state.deeds['0>1'] ?? []).some((d) => d.id === 'peace')).toBe(true);
    expect((state.deeds['1>0'] ?? []).some((d) => d.id === 'peace')).toBe(true);
  });
});

describe('insolvency', () => {
  it('an empty treasury disbands companies visibly, never goes negative', () => {
    const state = freshGame('broke-1');
    const player = state.players[0];
    const army = Object.values(state.armies).find((a) => a.owner === 0)!;
    // hire far beyond means
    for (let i = 0; i < 3; i++) {
      const extra = makeUnits('knights', 8);
      const a = { ...army, id: state.nextArmyId++, units: extra, heroIds: [], moved: false };
      state.armies[a.id] = a;
    }
    player.gold = 0;
    const before = Object.values(state.armies).filter((a) => a.owner === 0).reduce((n, a) => n + a.units.length, 0);
    cycleTo(state, 0);
    const after = Object.values(state.armies).filter((a) => a.owner === 0).reduce((n, a) => n + a.units.length, 0);
    expect(after).toBeLessThan(before);
    expect(player.gold).toBeGreaterThanOrEqual(0);
    expect(state.chronicle.some((c) => c.text.includes('treasury ran dry'))).toBe(true);
  });
});

describe('victory', () => {
  it('dominion is tracked, warned about, and won', () => {
    const state = freshGame('victory-dom', 3);
    // hand player 0 a dominant, fully pacified realm (no free companies left)
    for (const a of Object.values(state.armies)) {
      if (a.owner === -1) delete state.armies[a.id];
    }
    const need = Math.ceil(state.provinces.length * 0.65);
    let owned = 0;
    for (const p of state.provinces) {
      if (owned < need && p.owner !== 1 && p.owner !== 2) {
        p.owner = 0;
        p.order = 70;
        owned++;
      }
    }
    const over = (s: GameState) => s.phase === 'ended';
    for (let round = 0; round < 3 && !over(state); round++) {
      for (let i = 0; i < state.players.length && !over(state); i++) {
        applyAction(state, { t: 'endTurn' });
      }
    }
    expect(state.phase).toBe('ended');
    expect(state.victory.winner).toBe(0);
    expect(state.victory.winPath).toBe('dominion');
    expect(state.chronicle.some((c) => c.ceremony && c.text.length > 40)).toBe(true);
  });

  it('the chronicle always closes at max turns with a scored winner', () => {
    const s: GameSettings = { ...defaultSettings(), seed: 'victory-cap' };
    s.players = s.players.slice(0, 3);
    s.maxTurns = 3;
    const { state } = createGame(s);
    const over = (st: GameState) => st.phase === 'ended';
    for (let i = 0; i < 40 && !over(state); i++) {
      applyAction(state, { t: 'endTurn' });
    }
    expect(state.phase).toBe('ended');
    expect(state.victory.winner).not.toBeNull();
    expect(state.victory.winPath).toBe('chronicle');
  });
});

describe('saves & replay', () => {
  function playScriptedGame(): GameState {
    const state = freshGame('replay-1', 3);
    const over = (s: GameState) => s.phase === 'ended';
    // a few eventful rounds: builds, recruits, attacks, war
    const army0 = () => Object.values(state.armies).find((a) => a.owner === state.current);
    for (let round = 0; round < 6 && !over(state); round++) {
      for (let turnIdx = 0; turnIdx < 3 && !over(state); turnIdx++) {
        const pid = state.current;
        const player = state.players[pid];
        if (!player.alive) {
          applyAction(state, { t: 'endTurn' });
          continue;
        }
        const seat = state.provinces.find((p) => p.owner === pid);
        if (seat && round === 0) {
          applyAction(state, { t: 'build', province: seat.id, building: 'temple' });
          applyAction(state, { t: 'recruit', province: seat.id, unit: 'spears' });
        }
        if (round === 1 && pid === 0) {
          applyAction(state, { t: 'diplomacy', kind: 'declareWar', target: 1 });
        }
        const a = army0();
        if (a && !a.moved && round >= 1) {
          const targets = moveTargets(state, a);
          const hostile = targets.find((t) => t.hostile);
          if (hostile && round % 2 === 1) {
            applyAction(state, { t: 'moveArmy', armyId: a.id, to: hostile.to, viaSea: hostile.viaSea });
          }
        }
        applyAction(state, { t: 'endTurn' });
      }
    }
    return state;
  }

  it('seed + action log replays to an identical state', () => {
    const state = playScriptedGame();
    expect(state.log.length).toBeGreaterThan(15);
    const replayed = replayGame(state.settings, state.log);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(state));
  });

  it('save -> load round-trips exactly, mid-campaign', () => {
    const state = playScriptedGame();
    const loaded = deserializeGame(serializeGame(state));
    expect(loaded).toEqual(state);
    // and the loaded game continues identically to the original
    const a = JSON.parse(JSON.stringify(state)) as GameState;
    const b = loaded;
    applyAction(a, { t: 'endTurn' });
    applyAction(b, { t: 'endTurn' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rejects damaged or foreign saves', () => {
    expect(() => deserializeGame('{"app":"something-else"}')).toThrow();
    expect(() => deserializeGame('{"app":"realms-in-embers","v":1,"state":{}}')).toThrow();
  });
});
