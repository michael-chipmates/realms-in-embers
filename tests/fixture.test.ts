/**
 * The rules-version canary: a full AI game frozen at the current
 * RULES_VERSION. If this test fails after an engine change, the change
 * altered semantics or RNG consumption — either revert it, or (if the
 * change is DELIBERATE) bump RULES_VERSION in src/engine/state.ts and run
 * `npx tsx scripts/make-replay-fixture.mjs` to refreeze.
 */
import { describe, expect, it } from 'vitest';
import { replayGame } from '../src/engine/engine';
import { RULES_VERSION } from '../src/engine/state';
import { fnv } from './fixtureHash';
import fixture from './fixtures/replay-fixture.json';
import type { GameSettings, LoggedAction } from '../src/engine/types';

describe('rules-version canary', () => {
  it('the frozen fixture replays byte-identically under the current rules', () => {
    expect(fixture.rulesVersion).toBe(RULES_VERSION);
    const replayed = replayGame(fixture.settings as GameSettings, fixture.log as LoggedAction[]);
    expect(replayed.turn).toBe(fixture.finalTurn);
    expect(fnv(JSON.stringify(replayed))).toBe(fixture.finalHash);
  });
});
