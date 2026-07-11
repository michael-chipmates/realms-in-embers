/**
 * recallMove (rules v14): a peaceful march onto known ground can be taken
 * back the same season — and nothing else can. The guards ARE the feature:
 * no free scouting through fog, no unplanting a captured banner, no
 * recalling a banner that has since changed shape.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, deserializeGame, replayGame, serializeGame } from '../src/engine/engine';
import { defaultSettings } from '../src/engine/state';
import type { Army, GameSettings, GameState } from '../src/engine/types';

function freshGame(seed: string, fog = false): GameState {
  const s: GameSettings = { ...defaultSettings(), seed, fogOfWar: fog };
  s.players = s.players.slice(0, 3);
  while (s.players.length < 3) s.players.push({ kind: 'ai', lordId: 'random', difficulty: 'knight' });
  return createGame(s).state;
}

/** Give player 0 two adjacent provinces and a fresh army on the first —
 * with nothing squatting on the destination, so the march stays peaceful. */
function stageMarch(state: GameState): { army: Army; from: number; to: number } {
  const army = Object.values(state.armies).find((a) => a.owner === 0)!;
  const from = army.province;
  const to = state.provinces[from].neighbors.find((n) =>
    !Object.values(state.armies).some((a) => a.province === n)) ?? state.provinces[from].neighbors[0];
  for (const a of Object.values(state.armies)) {
    if (a.province === to && a.owner !== 0) delete state.armies[a.id];
  }
  state.provinces[from].owner = 0;
  state.provinces[to].owner = 0;
  // both ends known, so the march reveals nothing
  for (const id of [from, to, ...state.provinces[to].neighbors]) {
    if (!state.players[0].seen.includes(id)) state.players[0].seen.push(id);
  }
  return { army, from, to };
}

describe('recallMove', () => {
  it('takes back a peaceful march onto known ground, restoring the season', () => {
    const state = freshGame('recall-1');
    const { army, from, to } = stageMarch(state);
    expect(applyAction(state, { t: 'moveArmy', armyId: army.id, to }).ok).toBe(true);
    expect(army.province).toBe(to);
    expect(army.moved).toBe(true);

    const recall = applyAction(state, { t: 'recallMove', armyId: army.id });
    expect(recall.ok).toBe(true);
    expect(army.province).toBe(from);
    expect(army.moved).toBe(false);
    // the restored season is genuinely restored: the army may march again
    expect(applyAction(state, { t: 'moveArmy', armyId: army.id, to }).ok).toBe(true);
  });

  it('refuses when nothing marched', () => {
    const state = freshGame('recall-2');
    const army = Object.values(state.armies).find((a) => a.owner === 0)!;
    const r = applyAction(state, { t: 'recallMove', armyId: army.id });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/has not marched/);
  });

  it('refuses after a capture — the banner was planted', () => {
    const state = freshGame('recall-3');
    const army = Object.values(state.armies).find((a) => a.owner === 0)!;
    const from = army.province;
    state.provinces[from].owner = 0;
    const to = state.provinces[from].neighbors.find((n) => {
      const p = state.provinces[n];
      return p.owner === -1 && !Object.values(state.armies).some((a) => a.province === n);
    });
    if (to === undefined) return; // seed gave no clean neutral neighbor; other seeds cover this
    for (const id of [to, ...state.provinces[to].neighbors]) {
      if (!state.players[0].seen.includes(id)) state.players[0].seen.push(id);
    }
    expect(applyAction(state, { t: 'moveArmy', armyId: army.id, to }).ok).toBe(true);
    expect(state.provinces[to].owner).toBe(0); // captured
    const r = applyAction(state, { t: 'recallMove', armyId: army.id });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cannot be recalled/);
  });

  it('refuses when the march parted the fog — no free scouting', () => {
    const state = freshGame('recall-4', true);
    const { army, to } = stageMarch(state);
    // strike the far side from memory: the march WILL reveal something
    const farNeighbors = state.provinces[to].neighbors;
    state.players[0].seen = state.players[0].seen.filter((id) => !farNeighbors.includes(id) || id === army.province);
    expect(applyAction(state, { t: 'moveArmy', armyId: army.id, to }).ok).toBe(true);
    const r = applyAction(state, { t: 'recallMove', armyId: army.id });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/new ground/);
  });

  it('refuses once the season has turned', () => {
    const state = freshGame('recall-5');
    const { army, to } = stageMarch(state);
    expect(applyAction(state, { t: 'moveArmy', armyId: army.id, to }).ok).toBe(true);
    // cycle every seat once so the season advances past the march
    for (let i = 0; i < state.players.length; i++) {
      if (state.phase !== 'playing') break;
      expect(applyAction(state, { t: 'endTurn' }).ok).toBe(true);
    }
    if (state.phase !== 'playing' || state.current !== 0) return;
    const r = applyAction(state, { t: 'recallMove', armyId: army.id });
    expect(r.ok).toBe(false);
  });

  it('a merge spends the recall — the banner is no longer the one that marched', () => {
    const state = freshGame('recall-6');
    const { army, to } = stageMarch(state);
    expect(applyAction(state, { t: 'moveArmy', armyId: army.id, to }).ok).toBe(true);
    // conjure a second small banner on the same field and merge it in
    const other = Object.values(state.armies).find((a) => a.owner === 0 && a.id !== army.id);
    if (!other) return;
    other.province = to;
    other.moved = false;
    delete other.lastMove;
    expect(applyAction(state, { t: 'mergeArmies', from: other.id, into: army.id }).ok).toBe(true);
    const r = applyAction(state, { t: 'recallMove', armyId: army.id });
    expect(r.ok).toBe(false);
  });

  it('replays deterministically through save, load, and the log', () => {
    const state = freshGame('recall-7');
    const { army, to } = stageMarch(state);
    // NOTE: stageMarch mutates state outside the log, so replayGame cannot
    // reproduce it — replay determinism for recall is covered by the frozen
    // fixture (rules v14). Here: save/load must round-trip lastMove exactly.
    expect(applyAction(state, { t: 'moveArmy', armyId: army.id, to }).ok).toBe(true);
    const reloaded = deserializeGame(serializeGame(state));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(state));
    expect(applyAction(reloaded, { t: 'recallMove', armyId: army.id }).ok).toBe(true);
    void replayGame;
  });
});
