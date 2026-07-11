/**
 * The drift-proof meta-test (round-2 audit, F-2): the docs must quote the
 * balance gates the harness actually enforces. scripts/check-doc-gates.mjs
 * parses the gate constants out of src/sim/harness.ts and asserts
 * CHANGELOG.md and docs/ROADMAP.md carry the same numbers; this test runs it
 * so `npm test` (and CI) fails the moment either side moves alone.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const script = join(root, 'scripts', 'check-doc-gates.mjs');

describe('doc-gate drift check', () => {
  it('finds every enforced gate constant in the harness source', () => {
    const harness = readFileSync(join(root, 'src', 'sim', 'harness.ts'), 'utf8');
    expect(harness).toMatch(/const ROPE_PP = 0\.\d+;/); // per-lord ROPE band
    expect(harness).toMatch(/if \(gate && outside\) gateFailures/); // ROPE is the hard gate
    expect(harness).not.toMatch(/p < 0\.\d+\) gateFailures/); // bare p is evidence, never a gate
    expect(harness).toMatch(/share\('dominion'\) > 0\.\d+/); // dominion ceiling
    expect(harness).toMatch(/share\(path\) < 0\.\d+/); // per-path floor
    expect(harness).toMatch(/rate < \d+\.\d+\) gateFailures/); // signature floor
  });

  it('CHANGELOG.md and docs/ROADMAP.md quote the enforced gates', () => {
    // The script exits nonzero and names each drift; surface that as the
    // assertion message so the failure says exactly which number moved.
    let output = '';
    try {
      output = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      expect.fail(`check-doc-gates.mjs failed:\n${e.stderr ?? ''}${e.stdout ?? ''}`);
    }
    expect(output).toContain('doc gates in sync');
  });
});
