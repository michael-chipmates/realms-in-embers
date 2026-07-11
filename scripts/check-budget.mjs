// The performance budget, enforced where drift begins: the bundle.
// Runs after `npm run build` and fails when the shipped weight crosses the
// line — a regression argues with CI, not with a phone in the field.
//
// Budgets (gzip): app JS ≤ 190 KB, CSS ≤ 20 KB, index.html ≤ 25 KB.
// (v0.5 baseline: ~156 KB JS, ~9 KB CSS. The gap is headroom for features,
// not an invitation.) Runtime dependencies remain zero by principle —
// docs/ROADMAP.md do-not-break list.
//
// Field targets recorded here for the release evidence (measured by hand
// or profile, not enforceable in CI without device farms): LCP ≤ 2.5 s on
// a mid-range phone over 4G; INP ≤ 200 ms at the war table.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET = {
  js: 190 * 1024,
  css: 20 * 1024,
  html: 25 * 1024,
};

const dist = join(process.cwd(), 'dist');
let js = 0;
let css = 0;
const assets = join(dist, 'assets');
for (const f of readdirSync(assets)) {
  const gz = gzipSync(readFileSync(join(assets, f))).length;
  if (f.endsWith('.js')) js += gz;
  if (f.endsWith('.css')) css += gz;
}
const html = gzipSync(readFileSync(join(dist, 'index.html'))).length;

const rows = [
  ['app JS', js, BUDGET.js],
  ['app CSS', css, BUDGET.css],
  ['index.html', html, BUDGET.html],
];
let failed = false;
for (const [name, got, cap] of rows) {
  const ok = got <= cap;
  if (!ok) failed = true;
  console.log(`${String(name).padEnd(11)} ${(got / 1024).toFixed(1).padStart(7)} KB gz  (budget ${(cap / 1024).toFixed(0)} KB) ${ok ? '✓' : '✗ OVER BUDGET'}`);
}
if (failed) {
  console.error('\nBUNDLE OVER BUDGET — trim it or argue the budget up deliberately (this file), never silently.');
  process.exit(1);
}
console.log('bundle within budget');
