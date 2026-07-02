import { describe, expect, it } from 'vitest';
import { aiTakeTurn } from '../src/engine/ai';
import { createGame } from '../src/engine/engine';
import { defaultSettings } from '../src/engine/state';
import { checkInvariants } from '../src/sim/invariants';
import type { GameSettings } from '../src/engine/types';

/**
 * Fast standing guarantee inside `npm test`: full AI-vs-AI games run clean.
 * The heavy sweep lives in `npm run sim`.
 */
describe('simulation smoke', () => {
  it('plays full AI games to termination without crashes or invariant breaks', () => {
    for (let g = 0; g < 6; g++) {
      const s: GameSettings = {
        ...defaultSettings(),
        seed: `smoke-${g}`,
        mapSize: g % 2 === 0 ? 'small' : 'medium',
        maxTurns: 40,
        fogOfWar: g % 3 === 0,
      };
      s.players = Array.from({ length: 2 + (g % 3) }, (_, p) => ({
        kind: 'ai' as const,
        lordId: 'random',
        difficulty: (['squire', 'knight', 'warlord'] as const)[p % 3],
      }));
      const { state } = createGame(s);
      const maxSteps = (s.maxTurns + 4) * s.players.length + 40;
      let steps = 0;
      let lastTurn = state.turn;
      while (state.phase === 'playing') {
        expect(++steps).toBeLessThanOrEqual(maxSteps);
        aiTakeTurn(state);
        if (state.turn !== lastTurn) {
          lastTurn = state.turn;
          checkInvariants(state, s.seed);
        }
      }
      checkInvariants(state, s.seed);
      expect(state.victory.winner).not.toBeNull();
      expect(state.victory.winPath).not.toBeNull();
      // the chronicle told the story as it went
      expect(state.chronicle.length).toBeGreaterThan(10);
    }
  }, 30000);
});
