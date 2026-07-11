/**
 * Determinism guard: the engine must produce bit-identical results on every
 * browser and platform, because online play replays the same action log on
 * both ends and any drift desyncs the session silently.
 *
 * IEEE 754 only guarantees correct rounding for +, -, *, /, and Math.sqrt.
 * The transcendentals (pow, exp, log, sin, cos, ...) are implementation-
 * defined: V8, JavaScriptCore, and SpiderMonkey may disagree in the last
 * ulp, which is enough to fork two clients' states in mixed-browser games.
 * Math.random and wall-clock reads (Date.now, new Date, performance.now)
 * are nondeterministic outright. None of them may appear under src/engine/.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = join(__dirname, '..', 'src', 'engine');

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\bMath\.(pow|exp|log|log2|log10|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot|random)\b/,
    why: 'not correctly-rounded across engines (or nondeterministic) — only Math.sqrt and basic arithmetic are safe',
  },
  {
    pattern: /\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/,
    why: 'wall-clock reads make replays irreproducible',
  },
];

function engineFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...engineFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('Engine determinism guard', () => {
  it('no engine file reaches for transcendental math or the wall clock', () => {
    const files = engineFiles(ENGINE_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenses: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const { pattern, why } of FORBIDDEN) {
          const match = line.match(pattern);
          if (match) offenses.push(`${file}:${i + 1} uses ${match[0]} (${why})\n    ${line.trim()}`);
        }
      });
    }

    expect(offenses, `Nondeterministic calls in src/engine:\n${offenses.join('\n')}`).toEqual([]);
  });
});
