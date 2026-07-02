import { describe, expect, it } from 'vitest';
import { Rng, rngStateFrom } from '../src/engine/rng';

describe('Rng determinism', () => {
  it('same seed produces the same sequence', () => {
    const a = new Rng('ember');
    const b = new Rng('ember');
    for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next());
  });

  it('different seeds diverge', () => {
    const a = new Rng('ember');
    const b = new Rng('ash');
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('state array is mutated in place and resumable mid-stream', () => {
    const stateArr = rngStateFrom('resume-me');
    const a = new Rng(stateArr);
    for (let i = 0; i < 17; i++) a.next();
    const snapshot = [...stateArr];
    const expected = Array.from({ length: 20 }, () => a.next());
    const resumed = new Rng(snapshot);
    const actual = Array.from({ length: 20 }, () => resumed.next());
    expect(actual).toEqual(expected);
  });

  it('fork does not advance the parent and is itself deterministic', () => {
    const a = new Rng('fork-test');
    for (let i = 0; i < 5; i++) a.next();
    const before = [...a.s];
    const f1 = a.fork('preview');
    const f1seq = Array.from({ length: 10 }, () => f1.next());
    expect([...a.s]).toEqual(before);
    const f2 = a.fork('preview');
    const f2seq = Array.from({ length: 10 }, () => f2.next());
    expect(f1seq).toEqual(f2seq);
    const f3 = a.fork('other-label');
    expect(Array.from({ length: 10 }, () => f3.next())).not.toEqual(f1seq);
  });

  it('output is in [0,1) and reasonably uniform', () => {
    const rng = new Rng('uniformity');
    let sum = 0;
    const buckets = new Array(10).fill(0);
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      buckets[Math.floor(v * 10)]++;
    }
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
    for (const b of buckets) expect(b).toBeGreaterThan(n / 10 * 0.85);
  });

  it('helpers stay in bounds', () => {
    const rng = new Rng('bounds');
    for (let i = 0; i < 500; i++) {
      expect(rng.int(7)).toBeGreaterThanOrEqual(0);
      expect(rng.int(7)).toBeLessThan(7);
      const r = rng.intRange(3, 6);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(6);
    }
    const picks = new Set<number>();
    for (let i = 0; i < 200; i++) picks.add(rng.pick([1, 2, 3]));
    expect(picks).toEqual(new Set([1, 2, 3]));
    const weighted = new Set<string>();
    for (let i = 0; i < 300; i++) weighted.add(rng.pickWeighted(['a', 'b'], (x) => (x === 'a' ? 1 : 3)));
    expect(weighted.has('b')).toBe(true);
  });
});
