// Content reconciliation (D:ART-001 and friends): the media manifests, the
// files on disk, and the slots the code asks for must all agree — a plate
// that fell out of the manifest or a slot that silently kept its fallback
// is a bug the eye may miss but this script will not.
//   node scripts/check-content.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const problems = [];

// --- art: manifest ↔ files, two ways
const artDir = join(root, 'public', 'art');
const artManifest = JSON.parse(readFileSync(join(artDir, 'manifest.json'), 'utf8'));
const artFiles = new Set(readdirSync(artDir).filter((f) => f !== 'manifest.json'));
for (const [slot, file] of Object.entries(artManifest)) {
  if (!artFiles.has(file)) problems.push(`art manifest lists ${slot} → ${file}, but the file is missing`);
}
const listed = new Set(Object.values(artManifest));
for (const f of artFiles) {
  if (!listed.has(f)) problems.push(`public/art/${f} is on disk but in no manifest slot (dead weight ships to every phone)`);
}

// --- art: every slot the CODE asks for must resolve to a plate
const slotRefs = new Set();
function scanDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) scanDir(full);
    else if (entry.name.endsWith('.ts')) {
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/artSlot\(\s*[`'"]([^`'"$]+)[`'"]/g)) slotRefs.add(m[1]);
    }
  }
}
scanDir(join(root, 'src'));
for (const slot of slotRefs) {
  if (!artManifest[slot]) problems.push(`code asks for art slot "${slot}" but the manifest has no plate for it`);
}

// dynamic slot families (event-<id>, lord-<id>, unit-<id>…) fall back
// gracefully when unplated — deliberate for chain events — so families are
// REPORTED, never failed: the release evidence shows coverage at a glance.
const eventsSrc = readFileSync(join(root, 'src', 'engine', 'content', 'events.ts'), 'utf8');
const eventIds = [...eventsSrc.matchAll(/id: '([a-zA-Z]+)'/g)].map((m) => m[1]);
const platedEvents = eventIds.filter((id) => artManifest[`event-${id}`] !== undefined);
console.log(`events: ${platedEvents.length}/${new Set(eventIds).size} carry plates (the rest fall back by design)`);

// --- audio: manifest ↔ files
const audioDir = join(root, 'public', 'audio');
if (existsSync(join(audioDir, 'manifest.json'))) {
  const audioManifest = JSON.parse(readFileSync(join(audioDir, 'manifest.json'), 'utf8'));
  for (const file of Object.values(audioManifest)) {
    if (!existsSync(join(audioDir, file))) problems.push(`audio manifest lists ${file}, but the file is missing`);
  }
}

// --- counts reconcile, printed for the release evidence
console.log(`art: ${Object.keys(artManifest).length} slots in the manifest, ${artFiles.size} plates on disk, ${slotRefs.size} static slot refs in code`);

if (problems.length > 0) {
  console.error('\nCONTENT DRIFT:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('content reconciles: every plate named, every name plated');
