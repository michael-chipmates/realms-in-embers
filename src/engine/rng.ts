/**
 * The one source of randomness for the entire game core.
 *
 * sfc32 PRNG seeded from a human-readable string via cyrb128. The four-word
 * state lives INSIDE GameState (as a plain number[]), and Rng mutates that
 * array in place — so saving mid-turn and loading resumes the exact stream.
 *
 * `fork(label)` derives an independent side-stream from the current state
 * WITHOUT advancing it: previews (battle odds, quest odds) roll on forks, so
 * inspecting your chances never changes your fate.
 */

/** Hash a string into four 32-bit words (cyrb128). */
export function hashSeed(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** Cheap stable 32-bit string hash for labels and cosmetic variation. */
export function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  /** Backing state; when constructed over a state array, mutated in place. */
  readonly s: number[];

  constructor(seed: string | number[]) {
    if (typeof seed === 'string') {
      this.s = [...hashSeed(seed)];
      // warm up: early sfc32 outputs correlate with the seed words
      for (let i = 0; i < 12; i++) this.next();
    } else {
      this.s = seed; // by reference, intentionally
    }
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const s = this.s;
    const t = (((s[0] + s[1]) | 0) + s[3]) | 0;
    s[3] = (s[3] + 1) | 0;
    s[0] = s[1] ^ (s[1] >>> 9);
    s[1] = (s[2] + (s[2] << 3)) | 0;
    s[2] = (s[2] << 21) | (s[2] >>> 11);
    s[2] = (s[2] + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [0, n). n must be >= 1. */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [min, max] inclusive. */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform pick. Array must be non-empty. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Weighted pick; weights <= 0 are never chosen. Falls back to last item. */
  pickWeighted<T>(arr: readonly T[], weight: (item: T, i: number) => number): T {
    let total = 0;
    for (let i = 0; i < arr.length; i++) total += Math.max(0, weight(arr[i], i));
    if (total <= 0) return arr[arr.length - 1];
    let roll = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      roll -= Math.max(0, weight(arr[i], i));
      if (roll < 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  /** Fisher–Yates shuffle of a copy. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Roughly-normal sample (Irwin–Hall of 3), mean 0, clipped to [-1.5, 1.5]. */
  wobble(): number {
    return (this.next() + this.next() + this.next()) - 1.5;
  }

  /**
   * Independent side-stream derived from current state + label.
   * Does NOT advance this stream. Use for previews and cosmetic rolls.
   */
  fork(label: string): Rng {
    const mix = hash32(label);
    const forked = new Rng([
      (this.s[0] ^ mix) | 0,
      (this.s[1] ^ (mix << 13)) | 0,
      (this.s[2] ^ (mix >>> 7)) | 0,
      (this.s[3] + mix) | 0,
    ]);
    for (let i = 0; i < 8; i++) forked.next();
    return forked;
  }
}

/** A fresh serializable RNG state for embedding in GameState. */
export function rngStateFrom(seed: string): number[] {
  return new Rng(seed).s;
}
