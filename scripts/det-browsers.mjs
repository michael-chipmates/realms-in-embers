// DET-030: the frozen replay fixture, executed inside real Chromium,
// Firefox, AND WebKit. Every engine must replay the log to the exact same
// byte-hash the fixture froze — the determinism the online protocol and
// mixed-browser tables stand on. Fails loudly on the first disagreement.
// node scripts/det-browsers.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fixture = JSON.parse(readFileSync('tests/fixtures/replay-fixture.json', 'utf8'));

// bundle the zero-dependency engine (replayGame + fnv) into one IIFE
const work = mkdtempSync(join(tmpdir(), 'rie-det-'));
const entry = join(work, 'entry.ts');
writeFileSync(entry, `
import { replayGame } from '${process.cwd()}/src/engine/engine';
import { fnv } from '${process.cwd()}/src/engine/hash';
(window as any).__replayHash = (settings: any, log: any) => fnv(JSON.stringify(replayGame(settings, log)));
`);
const bundle = join(work, 'engine.js');
execFileSync(require.resolve('esbuild/bin/esbuild'), [entry, '--bundle', '--format=iife', `--outfile=${bundle}`], { stdio: 'inherit' });
const bundleSrc = readFileSync(bundle, 'utf8');
rmSync(work, { recursive: true, force: true });

const results = [];
for (const [name, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await type.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>det</title>');
  await page.addScriptTag({ content: bundleSrc });
  const hash = await page.evaluate(
    ([settings, log]) => window.__replayHash(settings, log),
    [fixture.settings, fixture.log],
  );
  await browser.close();
  results.push({ name, hash });
  console.log(`${name.padEnd(9)} ${hash} ${hash === fixture.finalHash ? '✓' : '✗ DIVERGED'}`);
}

const bad = results.filter((r) => r.hash !== fixture.finalHash);
if (bad.length > 0) {
  console.error(`\nDETERMINISM BROKEN: fixture froze ${fixture.finalHash} (rules v${fixture.rulesVersion}); ` +
    bad.map((b) => `${b.name} replayed to ${b.hash}`).join(', '));
  process.exit(1);
}
console.log(`all three engines replay rules v${fixture.rulesVersion} to ${fixture.finalHash}`);
