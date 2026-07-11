/**
 * Pattern uniqueness at the table: twelve lords share six heraldic fill
 * patterns, so two seated lords could collide — invisible in color, hostile
 * in colorblind mode. `assignPatterns` must hand every seated lord a unique
 * pattern, deterministically, while letting lords keep their own heraldry
 * whenever it is free.
 */
import { describe, expect, it } from 'vitest';
import { assignPatterns, SIGIL_PATTERNS } from '../src/ui/heraldry';
import { LORD_BY_ID } from '../src/engine/content/lords';

const LORD_IDS = Object.keys(LORD_BY_ID);

/** Every subset of the twelve lords up to the table maximum of six seats. */
function* subsetsUpTo(max: number): Generator<string[]> {
  const n = LORD_IDS.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const ids: string[] = [];
    for (let b = 0; b < n; b++) if (mask & (1 << b)) ids.push(LORD_IDS[b]);
    if (ids.length <= max) yield ids;
  }
}

describe('assignPatterns', () => {
  it('gives every seated lord a unique pattern, for every possible table', () => {
    let tables = 0;
    for (const ids of subsetsUpTo(6)) {
      const assigned = assignPatterns(ids);
      const patterns = ids.map((id) => assigned[id]);
      expect(new Set(patterns).size).toBe(ids.length);
      for (const p of patterns) expect(SIGIL_PATTERNS).toContain(p);
      tables++;
    }
    expect(tables).toBeGreaterThan(2000); // all 1..6-seat subsets of 12 lords
  });

  it('lets a lord keep their own heraldry when no earlier seat took it', () => {
    for (const ids of subsetsUpTo(6)) {
      const assigned = assignPatterns(ids);
      const seen = new Set<string>();
      for (const id of ids) {
        const own = LORD_BY_ID[id].pattern;
        if (!seen.has(own)) expect(assigned[id]).toBe(own);
        seen.add(own);
      }
    }
  });

  it('is deterministic: same seats, same patterns', () => {
    const ids = LORD_IDS.slice(0, 6);
    expect(assignPatterns(ids)).toEqual(assignPatterns(ids));
    expect(assignPatterns([...ids])).toEqual(assignPatterns(ids));
  });

  it('resolves the known plain-vs-plain collision', () => {
    // Two lords ship with pattern 'plain'; seat them together.
    const plains = LORD_IDS.filter((id) => LORD_BY_ID[id].pattern === 'plain');
    expect(plains.length).toBeGreaterThanOrEqual(2);
    const assigned = assignPatterns(plains);
    expect(new Set(plains.map((id) => assigned[id])).size).toBe(plains.length);
  });
});
