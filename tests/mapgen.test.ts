import { describe, expect, it } from 'vitest';
import { generateMap, MAP_SIZES, pickSeats } from '../src/engine/mapgen';
import { Rng } from '../src/engine/rng';
import type { MapSize } from '../src/engine/types';

const SIZES: MapSize[] = ['small', 'medium', 'large'];

describe('map generation', () => {
  it('is deterministic for a given seed', () => {
    const a = generateMap(new Rng('same-seed'), 'medium');
    const b = generateMap(new Rng('same-seed'), 'medium');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('differs across seeds', () => {
    const a = generateMap(new Rng('seed-one'), 'medium');
    const b = generateMap(new Rng('seed-two'), 'medium');
    expect(JSON.stringify(a.cells)).not.toBe(JSON.stringify(b.cells));
  });

  for (const size of SIZES) {
    it(`produces valid ${size} maps across many seeds`, () => {
      for (let s = 0; s < 12; s++) {
        const map = generateMap(new Rng(`validity-${size}-${s}`), size);
        const cfg = MAP_SIZES[size];
        expect(map.provinces.length).toBeGreaterThanOrEqual(cfg.provinces - 2);
        expect(map.provinces.length).toBeLessThanOrEqual(cfg.provinces);

        // every province: enough cells, at least one neighbor, symmetric adjacency
        for (const p of map.provinces) {
          expect(p.cells).toBeGreaterThanOrEqual(16);
          expect(p.neighbors.length).toBeGreaterThan(0);
          for (const n of p.neighbors) {
            expect(map.provinces[n].neighbors).toContain(p.id);
          }
          for (const n of p.riverBorders) expect(p.neighbors).toContain(n);
          for (const n of p.seaLinks) {
            expect(map.provinces[n].coastal).toBe(true);
            expect(p.coastal).toBe(true);
          }
        }

        // connected by land marches
        const seen = new Set([0]);
        const stack = [0];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const n of map.provinces[cur].neighbors) {
            if (!seen.has(n)) {
              seen.add(n);
              stack.push(n);
            }
          }
        }
        expect(seen.size).toBe(map.provinces.length);

        // flavor guarantees
        const terrains = map.provinces.map((p) => p.terrain);
        expect(terrains).toContain('mountain');
        expect(terrains).toContain('forest');
        expect(terrains).toContain('moor');
        const embersites = map.provinces.filter((p) => p.site === 'embersite').length;
        expect(embersites).toBeGreaterThanOrEqual(2);
        expect(map.provinces.some((p) => p.site === 'ruin')).toBe(true);
        expect(map.provinces.some((p) => p.site === 'barrow')).toBe(true);

        // unique names, real flavor text everywhere
        const names = new Set(map.provinces.map((p) => p.name));
        expect(names.size).toBe(map.provinces.length);
        for (const p of map.provinces) {
          expect(p.name.length).toBeGreaterThan(2);
          expect(p.flavor.length).toBeGreaterThan(10);
        }

        // grid consistent with province cell counts
        const counted = new Map<number, number>();
        for (const c of map.cells) {
          if (c >= 0) counted.set(c, (counted.get(c) ?? 0) + 1);
        }
        for (const p of map.provinces) expect(counted.get(p.id)).toBe(p.cells);
      }
    });
  }

  it('picks well-separated seats', () => {
    for (let s = 0; s < 8; s++) {
      const rng = new Rng(`seats-${s}`);
      const map = generateMap(rng, 'medium');
      for (const count of [2, 4, 6]) {
        const seats = pickSeats(rng, map.provinces, count);
        expect(new Set(seats).size).toBe(count);
        for (let i = 0; i < seats.length; i++) {
          for (let j = i + 1; j < seats.length; j++) {
            const a = map.provinces[seats[i]];
            const b = map.provinces[seats[j]];
            // seats never border each other on a medium map
            expect(a.neighbors).not.toContain(b.id);
          }
        }
      }
    }
  });
});
