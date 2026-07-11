/**
 * UX-030 — the ActionEvaluation window. Evaluation dry-runs the one real
 * validator, so these tests pin the three promises that make it safe to
 * build UI, tutorial, and advisors on top of it:
 *   1. evaluating never changes the state (bytes, RNG stream included);
 *   2. its verdict and words always match applyAction's;
 *   3. its cost lines equal what the treasury actually loses.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, evaluateAction, evaluateActions } from '../src/engine/engine';
import { defaultSettings } from '../src/engine/state';
import { BUILD_ORDER, BUILDINGS } from '../src/engine/content/world';
import { RECRUITABLE } from '../src/engine/content/units';
import { moveTargets } from '../src/engine/actions';
import type { Action, GameSettings, GameState } from '../src/engine/types';

function freshGame(seed: string, players = 3): GameState {
  const s: GameSettings = { ...defaultSettings(), seed };
  s.players = s.players.slice(0, players);
  while (s.players.length < players) s.players.push({ kind: 'ai', lordId: 'random', difficulty: 'knight' });
  return createGame(s).state;
}

/** A broad batch of candidates: legal, illegal, and nonsensical. */
function candidates(state: GameState): Action[] {
  const pid = state.current;
  const mine = state.provinces.filter((p) => p.owner === pid);
  const army = Object.values(state.armies).find((a) => a.owner === pid);
  const out: Action[] = [
    { t: 'setTax', level: 'harsh' },
    { t: 'setTax', level: 'nonsense' as never },
    { t: 'build', province: mine[0].id, building: BUILD_ORDER[0] },
    { t: 'build', province: mine[0].id, building: 'no-such-works' as never },
    { t: 'recruit', province: mine[0].id, unit: RECRUITABLE[0] },
    { t: 'recruit', province: mine[0].id, unit: 'revenants' },
    { t: 'hireHero', offerIdx: 0 },
    { t: 'hireHero', offerIdx: 99 },
    { t: 'diplomacy', kind: 'gift', target: (pid + 1) % state.players.length, gold: 25 },
    { t: 'diplomacy', kind: 'gift', target: pid, gold: 25 },
    { t: 'diplomacy', kind: 'offerPeace', target: (pid + 1) % state.players.length },
    { t: 'castSpell', spell: 'bless' as never },
    { t: 'pledgeEmberlight', amount: 3 },
    { t: 'concede' },
    { t: 'endTurn' },
  ];
  if (army) {
    out.push({ t: 'setStance', armyId: army.id, stance: 'bold' });
    out.push({ t: 'disband', armyId: army.id, index: 0 });
    out.push({ t: 'disband', armyId: army.id, index: 99 });
    const target = moveTargets(state, army)[0];
    if (target) out.push({ t: 'moveArmy', armyId: army.id, to: target.to, viaSea: target.viaSea });
    out.push({ t: 'moveArmy', armyId: army.id, to: 9999 });
  }
  return out;
}

describe('evaluateAction', () => {
  it('never mutates the state it evaluates, over a full batch', () => {
    const state = freshGame('eval-pure-1');
    const before = JSON.stringify(state);
    evaluateActions(state, candidates(state));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('agrees with applyAction on verdict and wording for every candidate', () => {
    const state = freshGame('eval-agree-1');
    for (const action of candidates(state)) {
      const ev = evaluateAction(state, action);
      // apply on a private copy so each candidate is judged from the same state
      const copy = structuredClone(state);
      const result = applyAction(copy, action);
      expect(ev.legal, `verdicts differ for ${JSON.stringify(action)}`).toBe(result.ok);
      if (!result.ok) {
        expect(ev.reasons[0], `reasons differ for ${JSON.stringify(action)}`).toBe(result.error);
      } else {
        expect(ev.reasons).toEqual([]);
      }
    }
  });

  it('batch evaluation matches one-by-one evaluation', () => {
    const state = freshGame('eval-batch-1');
    const acts = candidates(state);
    const batch = evaluateActions(state, acts);
    acts.forEach((action, i) => {
      expect(batch[i]).toEqual(evaluateAction(state, action));
    });
  });

  it('cost lines equal the gold the treasury actually loses', () => {
    const state = freshGame('eval-cost-1');
    const pid = state.current;
    const mine = state.provinces.filter((p) => p.owner === pid);
    const buildable = BUILD_ORDER.map((b): Action => ({ t: 'build', province: mine[0].id, building: b }));
    const gifts: Action[] = [{ t: 'diplomacy', kind: 'gift', target: (pid + 1) % state.players.length, gold: 40 }];
    for (const action of [...buildable, ...gifts]) {
      const ev = evaluateAction(state, action);
      if (!ev.legal) continue;
      const goldCost = ev.costs.filter((c) => c.resource === 'gold').reduce((s, c) => s + c.amount, 0);
      const copy = structuredClone(state);
      const before = copy.players[pid].gold;
      const result = applyAction(copy, action);
      expect(result.ok).toBe(true);
      expect(before - copy.players[pid].gold, `treasury delta for ${JSON.stringify(action)}`).toBe(goldCost);
    }
  });

  it('an unaffordable action is illegal, and its cost line still names the price', () => {
    const state = freshGame('eval-broke-1');
    const pid = state.current;
    const mine = state.provinces.filter((p) => p.owner === pid);
    // find a pair whose only obstacle can be the treasury
    state.players[pid].gold = 100000;
    const pairs = mine.flatMap((p) => BUILD_ORDER.map((b): Action => ({ t: 'build', province: p.id, building: b })));
    const buildable = pairs.find((a) => evaluateAction(state, a).legal);
    expect(buildable).toBeDefined();
    state.players[pid].gold = 0;
    const ev = evaluateAction(state, buildable!);
    expect(ev.legal).toBe(false);
    expect(ev.reasons[0]).toMatch(/gold/);
    expect(ev.costs[0].resource).toBe('gold');
    expect(ev.costs[0].amount).toBeGreaterThan(0);
    const built = (buildable as Extract<Action, { t: 'build' }>).building;
    expect(ev.costs[0].label).toContain(BUILDINGS[built].name);
  });

  it('fervor rides as an emberlight cost on a hostile march', () => {
    const state = freshGame('eval-fervor-1');
    const pid = state.current;
    const army = Object.values(state.armies).find((a) => a.owner === pid)!;
    const ev = evaluateAction(state, { t: 'moveArmy', armyId: army.id, to: 0, fervor: true });
    const ember = ev.costs.find((c) => c.resource === 'emberlight');
    expect(ember).toBeDefined();
    expect(ember!.amount).toBeGreaterThan(0);
  });

  it('every action kind points at a Codex chapter', () => {
    const state = freshGame('eval-codex-1');
    for (const action of candidates(state)) {
      const ev = evaluateAction(state, action);
      expect(ev.codex, `${action.t} has no codex chapter`).not.toBeNull();
    }
  });

  it('a closed chronicle refuses everything, with the standing words', () => {
    const state = freshGame('eval-ended-1');
    state.phase = 'ended';
    const ev = evaluateAction(state, { t: 'endTurn' });
    expect(ev.legal).toBe(false);
    expect(ev.reasons[0]).toBe('The chronicle is closed.');
  });
});
