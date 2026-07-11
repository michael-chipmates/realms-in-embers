// Doc-gate drift check: the docs must quote the gates the harness actually
// enforces. Parses the gate constants out of src/sim/harness.ts (the single
// source of truth) and asserts CHANGELOG.md and docs/ROADMAP.md quote the
// same numbers. Exits nonzero, naming each drift, otherwise stays silent-ish.
//
//   node scripts/check-doc-gates.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const harness = read('src/sim/harness.ts');

/** Pull one numeric gate constant out of the harness source, or die. */
function gateNumber(name, re) {
  const m = harness.match(re);
  if (!m) {
    console.error(`FATAL: could not find the ${name} gate in src/sim/harness.ts (pattern ${re})`);
    process.exit(2);
  }
  return m[1];
}

// The enforced gates, as written in the harness itself.
const gates = {
  // if (gate && p < 0.01) → docs must say "p ≥ 0.01"
  pThreshold: gateNumber('per-lord p-value', /p < (0\.\d+)\) gateFailures/),
  // share('dominion') > 0.40 → docs must say "≤ 40%"
  dominionMax: gateNumber('dominion ceiling', /share\('dominion'\) > (0\.\d+)/),
  // share(path) < 0.04 → docs must say "≥ 4%"
  pathMin: gateNumber('path floor', /share\(path\) < (0\.\d+)/),
  // rate < 1.0 → docs must say "≥ 1.0 uses/seat"
  signatureFloor: gateNumber('signature floor', /rate < (\d+\.\d+)\) gateFailures/),
};

const pct = (frac) => `${Math.round(parseFloat(frac) * 100)}%`;

// What each doc must contain, phrased the way the docs phrase gates.
// (≥ = ≥, ≤ = ≤ — kept literal so the docs read naturally.)
const requirements = [
  { text: `p ≥ ${gates.pThreshold}`, gate: 'per-lord fairness threshold' },
  { text: `≤ ${pct(gates.dominionMax)}`, gate: 'dominion ending ceiling' },
  { text: `≥ ${pct(gates.pathMin)}`, gate: 'per-path ending floor' },
  { text: `≥ ${gates.signatureFloor} uses/seat`, gate: 'signature-use floor' },
];

const docs = ['CHANGELOG.md', 'docs/ROADMAP.md'];
const drifts = [];
for (const doc of docs) {
  const body = read(doc);
  for (const req of requirements) {
    if (!body.includes(req.text)) {
      drifts.push(`${doc} does not quote the ${req.gate}: expected the text "${req.text}"`);
    }
  }
}

if (drifts.length > 0) {
  console.error('DOC-GATE DRIFT — the docs no longer match the enforced gates:');
  for (const d of drifts) console.error(`  ✗ ${d}`);
  console.error('Fix the docs (or, if a gate legitimately moved, update both docs to the new gate).');
  process.exit(1);
}

console.log(
  `doc gates in sync: p ≥ ${gates.pThreshold}, dominion ≤ ${pct(gates.dominionMax)}, ` +
  `paths ≥ ${pct(gates.pathMin)}, signatures ≥ ${gates.signatureFloor} uses/seat ` +
  `(checked ${docs.join(', ')})`,
);
