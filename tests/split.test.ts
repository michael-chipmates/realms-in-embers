/**
 * splitArmy (rules v16): a banner raises a second banner in place. The
 * guards are the feature: no free tempo, no empty banners, no reaching
 * into someone else's ranks.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, deserializeGame, serializeGame } from '../src/engine/engine';
import { defaultSettings } from '../src/engine/state';
import { makeUnits } from '../src/engine/helpers';
import type { Army, GameSettings, GameState } from '../src/engine/types';

function freshGame(seed: string): GameState {
  const s: GameSettings = { ...defaultSettings(), seed };
  s.players = s.players.slice(0, 3);
  while (s.players.length < 3) s.players.push({ kind: 'ai', lordId: 'random', difficulty: 'knight' });
  return createGame(s).state;
}

function bigArmy(state: GameState): Army {
  const army = Object.values(state.armies).find((a) => a.owner === 0)!;
  while (army.units.length < 4) army.units.push(...makeUnits('militia', 1));
  return army;
}

describe('splitArmy', () => {
  it('raises a second banner in place with exactly the chosen companies', () => {
    const state = freshGame('split-1');
    const army = bigArmy(state);
    const total = army.units.length;
    const marked = [1, 3];
    const markedTypes = marked.map((i) => army.units[i].type);
    const before = Object.keys(state.armies).length;
    const r = applyAction(state, { t: 'splitArmy', armyId: army.id, indices: marked });
    expect(r.ok).toBe(true);
    expect(Object.keys(state.armies).length).toBe(before + 1);
    const split = Object.values(state.armies).find((a) => a.owner === 0 && a.id !== army.id && a.province === army.province)!;
    expect(split.units.map((u) => u.type)).toEqual(markedTypes);
    expect(army.units.length).toBe(total - marked.length);
    expect(split.heroIds).toEqual([]);
  });

  it('the new banner inherits the season already spent: no free march', () => {
    const state = freshGame('split-2');
    const army = bigArmy(state);
    army.moved = true;
    const r = applyAction(state, { t: 'splitArmy', armyId: army.id, indices: [0] });
    expect(r.ok).toBe(true);
    const split = Object.values(state.armies).find((a) => a.owner === 0 && a.id !== army.id)!;
    expect(split.moved).toBe(true);
  });

  it('a fresh banner may still march after the split', () => {
    const state = freshGame('split-3');
    const army = bigArmy(state);
    expect(army.moved).toBe(false);
    applyAction(state, { t: 'splitArmy', armyId: army.id, indices: [0, 1] });
    const split = Object.values(state.armies).find((a) => a.owner === 0 && a.id !== army.id)!;
    expect(split.moved).toBe(false);
  });

  it('refuses to empty the old banner, refuses nothing chosen, refuses bad indices', () => {
    const state = freshGame('split-4');
    const army = bigArmy(state);
    const all = army.units.map((_, i) => i);
    expect(applyAction(state, { t: 'splitArmy', armyId: army.id, indices: all }).ok).toBe(false);
    expect(applyAction(state, { t: 'splitArmy', armyId: army.id, indices: [] }).ok).toBe(false);
    expect(applyAction(state, { t: 'splitArmy', armyId: army.id, indices: [99] }).ok).toBe(false);
    expect(applyAction(state, { t: 'splitArmy', armyId: 9999, indices: [0] }).ok).toBe(false);
  });

  it('duplicate indices collapse to one company, never a copy', () => {
    const state = freshGame('split-5');
    const army = bigArmy(state);
    const total = army.units.length;
    const r = applyAction(state, { t: 'splitArmy', armyId: army.id, indices: [2, 2, 2] });
    expect(r.ok).toBe(true);
    const split = Object.values(state.armies).find((a) => a.owner === 0 && a.id !== army.id)!;
    expect(split.units.length).toBe(1);
    expect(army.units.length + split.units.length).toBe(total);
  });

  it('a split banner merges back and the realm round-trips through a save', () => {
    const state = freshGame('split-6');
    const army = bigArmy(state);
    applyAction(state, { t: 'splitArmy', armyId: army.id, indices: [0] });
    const split = Object.values(state.armies).find((a) => a.owner === 0 && a.id !== army.id)!;
    const reloaded = deserializeGame(serializeGame(state));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(state));
    expect(applyAction(state, { t: 'mergeArmies', from: split.id, into: army.id }).ok).toBe(true);
  });
});
