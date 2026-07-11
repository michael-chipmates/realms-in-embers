/**
 * The Season Digest (rules v13): Osperan closes every completed season with
 * exactly one digest entry, the digest replays deterministically, and the
 * shared pure filter (engine/narrator.filterChronicle) keeps the feed short
 * without ever swallowing a ceremony.
 */
import { describe, expect, it } from 'vitest';
import { aiTakeTurn } from '../src/engine/ai';
import { createGame, replayGame } from '../src/engine/engine';
import { digestView, filterChronicle } from '../src/engine/narrator';
import { defaultSettings } from '../src/engine/state';
import type { ChronicleEntry, GameSettings, GameState } from '../src/engine/types';

function runAiGame(seed: string, maxTurns: number): GameState {
  const s: GameSettings = {
    ...defaultSettings(),
    seed,
    mapSize: 'small',
    maxTurns,
    fogOfWar: false,
  };
  s.players = Array.from({ length: 4 }, () => ({
    kind: 'ai' as const, lordId: 'random', difficulty: 'knight' as const,
  }));
  const { state } = createGame(s);
  let guard = 0;
  while (state.phase === 'playing' && guard++ < 8000) aiTakeTurn(state);
  expect(state.phase).toBe('ended');
  return state;
}

describe('season digest', () => {
  it('a ~15-season AI game gets exactly one digest entry per completed season', () => {
    const state = runAiGame('digest-fifteen', 15);
    // state.turn only advances at roundEnd, so completed seasons = turn - 1
    const completed = state.turn - 1;
    expect(completed).toBeGreaterThanOrEqual(10); // the game actually ran
    const digests = state.chronicle.filter((e) => e.digest);
    expect(digests.length).toBe(completed);
    // one per season, in order, none duplicated, none for the unfinished season
    expect(digests.map((e) => e.turn)).toEqual(
      Array.from({ length: completed }, (_, i) => i + 1),
    );
    for (const d of digests) {
      expect(d.kind).toBe('turn');
      expect(d.text.length).toBeGreaterThan(40); // real prose, not a stub
    }
  });

  it('digest entries replay byte-identically from the action log', () => {
    const state = runAiGame('digest-replay', 12);
    const replayed = replayGame(state.settings, state.log);
    expect(JSON.stringify(replayed.chronicle)).toBe(JSON.stringify(state.chronicle));
    expect(replayed.chronicle.some((e) => e.digest)).toBe(true);
    // and the whole state agrees, not just the chronicle
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(state));
  });

  it('the pure filter renders a quiet season in at most 6 lines', () => {
    const mk = (over: Partial<ChronicleEntry>): ChronicleEntry => ({
      turn: 7, kind: 'turn', text: 'x', about: null, ...over,
    });
    const quietSeason: ChronicleEntry[] = [
      mk({ text: 'Rain on the passes this season.' }),
      mk({ text: 'The granary mice are fat this year.' }),
      mk({ kind: 'realm', minor: true, text: 'Treasury ran dry.' }),
      mk({ kind: 'realm', minor: true, text: 'Guild loan repaid.' }),
      mk({ kind: 'realm', minor: true, text: 'Guild loan defaulted.' }),
      mk({ kind: 'teaching', text: 'A marginal note on order.' }),
      mk({ kind: 'event', text: 'A peddler arrived with dubious relics.' }),
      mk({ digest: true, text: 'The season passed as seasons do.' }),
    ];
    const visible = filterChronicle(quietSeason, true);
    expect(visible.length).toBeLessThanOrEqual(6);
    // exactly the survivors we expect: digest, teaching, event
    expect(visible.map((e) => e.kind).sort()).toEqual(['event', 'teaching', 'turn']);
    expect(visible.find((e) => e.kind === 'turn')?.digest).toBe(true);
    // digest OFF is exactly the pre-digest feed: everything but the digest line
    const off = filterChronicle(quietSeason, false);
    expect(off.length).toBe(quietSeason.length - 1);
    expect(off.every((e) => !e.digest)).toBe(true);
  });

  it('ceremonies, battles, diplomacy, heroes, magic, events and teachings are never digested', () => {
    const state = runAiGame('digest-ceremony', 25);
    const visible = new Set(filterChronicle(state.chronicle, true));
    for (const e of state.chronicle) {
      if (e.ceremony) expect(visible.has(e)).toBe(true);
      if (['ceremony', 'war', 'diplomacy', 'hero', 'magic', 'event', 'teaching'].includes(e.kind)) {
        expect(visible.has(e)).toBe(true);
      }
      if (e.kind === 'realm' && !e.minor) expect(visible.has(e)).toBe(true);
    }
  });

  it('acceptance: a full game reads under 80 visible entries with digest on', () => {
    const seeds = ['digest-accept-1', 'digest-accept-2', 'digest-accept-3'];
    for (const seed of seeds) {
      const state = runAiGame(seed, 40);
      // the default Digest view: older seasons collapsed to their digest
      // line + ceremonies, the current season fully expanded
      const visible = digestView(state.chronicle, state.turn);
      expect(visible.length).toBeLessThan(80);
      // and digest mode genuinely earns its keep against the raw feed
      expect(visible.length).toBeLessThan(state.chronicle.length / 2);
      // every ceremony still on the page even in the collapsed view
      for (const e of state.chronicle) {
        if (e.ceremony) expect(visible.includes(e)).toBe(true);
      }
    }
  });
});
