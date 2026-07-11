/**
 * The save-migration registry's proof: a save from an older rules version
 * loads, gains the shapes newer versions introduced, and PLAYS — because a
 * promise that old chronicles reopen is only worth the test that reopens
 * one. (Byte-exact replay stays version-bound; that's the fixture canary's
 * job, not this one's.)
 */
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, deserializeGame, serializeGame } from '../src/engine/engine';
import { defaultSettings, RULES_VERSION } from '../src/engine/state';
import type { GameSettings } from '../src/engine/types';

function agedSave(mutate: (state: Record<string, unknown>) => void): string {
  const s: GameSettings = { ...defaultSettings(), seed: 'migration-1' };
  const { state } = createGame(s);
  const file = JSON.parse(serializeGame(state));
  mutate(file.state);
  return JSON.stringify(file);
}

describe('save migrations', () => {
  it('a pre-v11 save (no signature cooldowns) loads with them zeroed', () => {
    const old = agedSave((st) => {
      st.v = 10;
      for (const p of st.players as Record<string, unknown>[]) delete p.signatureCooldownLeft;
    });
    const loaded = deserializeGame(old);
    expect(loaded.v).toBe(10); // the save keeps its age; only shapes upgrade
    for (const p of loaded.players) expect(p.signatureCooldownLeft).toBe(0);
  });

  it('a migrated save actually plays forward', () => {
    const old = agedSave((st) => {
      st.v = 10;
      for (const p of st.players as Record<string, unknown>[]) delete p.signatureCooldownLeft;
    });
    const loaded = deserializeGame(old);
    expect(applyAction(loaded, { t: 'setTax', level: 'harsh' }).ok).toBe(true);
    expect(applyAction(loaded, { t: 'endTurn' }).ok).toBe(true);
  });

  it('a save from a NEWER age is refused, in the standing words', () => {
    const future = agedSave((st) => { st.v = RULES_VERSION + 1; });
    expect(() => deserializeGame(future)).toThrow(/newer age/);
  });

  it('a current save round-trips byte-true (no migration touches it)', () => {
    const s: GameSettings = { ...defaultSettings(), seed: 'migration-2' };
    const { state } = createGame(s);
    const reloaded = deserializeGame(serializeGame(state));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(state));
  });
});
