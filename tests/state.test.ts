import { describe, expect, it } from 'vitest';
import { LORD_BY_ID } from '../src/engine/content/lords';
import { armiesIn, heroesOf } from '../src/engine/helpers';
import { defaultSettings, initGame } from '../src/engine/state';
import type { GameSettings } from '../src/engine/types';

function settingsWithSeed(seed: string, players = 4): GameSettings {
  const s = defaultSettings();
  s.seed = seed;
  s.players = s.players.slice(0, Math.max(2, players));
  while (s.players.length < players) s.players.push({ kind: 'ai', lordId: 'random', difficulty: 'knight' });
  return s;
}

describe('initGame', () => {
  it('is deterministic for identical settings', () => {
    const a = initGame(settingsWithSeed('det-check'));
    const b = initGame(settingsWithSeed('det-check'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is a plain serializable object (JSON round-trip preserves everything)', () => {
    const state = initGame(settingsWithSeed('serial-check'));
    const roundTripped = JSON.parse(JSON.stringify(state));
    expect(roundTripped).toEqual(state);
  });

  it('sets up players, seats, armies, heroes, court and chronicle', () => {
    for (const count of [2, 4, 6]) {
      const state = initGame(settingsWithSeed(`setup-${count}`, count));
      expect(state.players.length).toBe(count);
      const lordIds = new Set(state.players.map((p) => p.lordId));
      expect(lordIds.size).toBe(count);

      for (const player of state.players) {
        expect(LORD_BY_ID[player.lordId]).toBeDefined();
        const seat = state.provinces[player.seatProvince];
        expect(seat.owner).toBe(player.id);
        expect(seat.seatOf).toBe(player.id);
        expect(seat.buildings).toContain('walls1');

        const armies = armiesIn(state, seat.id).filter((a) => a.owner === player.id);
        expect(armies.length).toBe(1);
        expect(armies[0].units.length).toBeGreaterThanOrEqual(3);

        const heroes = heroesOf(state, player.id);
        expect(heroes.length).toBe(1);
        expect(heroes[0].level).toBe(2);
        expect(heroes[0].armyId).toBe(armies[0].id);

        expect(player.courtOffers.length).toBe(2);
        expect(player.gold).toBeGreaterThan(0);
      }

      // neutral provinces garrisoned
      const neutrals = state.provinces.filter((p) => p.owner === -1);
      expect(neutrals.length).toBeGreaterThan(0);
      for (const p of neutrals) {
        const defenders = armiesIn(state, p.id);
        expect(defenders.length).toBeGreaterThanOrEqual(1);
      }

      // opening chronicle entry mentions every lord
      expect(state.chronicle.length).toBe(1);
      for (const player of state.players) {
        expect(state.chronicle[0].text).toContain(LORD_BY_ID[player.lordId].name);
      }
    }
  });

  it('honors explicit lord choices and difficulty handicaps', () => {
    const s = settingsWithSeed('explicit-lords');
    s.players = [
      { kind: 'human', lordId: 'seraphine', difficulty: 'knight' },
      { kind: 'ai', lordId: 'morrikan', difficulty: 'warlord' },
      { kind: 'ai', lordId: 'random', difficulty: 'squire' },
    ];
    const state = initGame(s);
    expect(state.players[0].lordId).toBe('seraphine');
    expect(state.players[1].lordId).toBe('morrikan');
    expect(state.players[1].handicap.incomeMult).toBe(1.25);
    expect(state.players[2].handicap.incomeMult).toBe(0.85);
    expect(state.players[2].lordId).not.toBe('seraphine');
    expect(state.players[2].lordId).not.toBe('morrikan');
    // handicaps carry visible explanations
    for (const p of state.players) expect(p.handicap.label.length).toBeGreaterThan(5);
  });

  it('fog of war limits initial visibility', () => {
    const s = settingsWithSeed('fog-check');
    s.fogOfWar = true;
    const state = initGame(s);
    for (const p of state.players) {
      expect(p.seen.length).toBeLessThan(state.provinces.length);
      expect(p.seen).toContain(p.seatProvince);
    }
  });
});
