// Export /lords/ — the twelve claimants as one static, crawlable page,
// rendered straight from the engine's own content so it can never drift
// (same doctrine as the Codex export). Regenerate whenever lords change:
//   npx tsx scripts/export-lords.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LORDS } from '../src/engine/content/lords.ts';
import { CREEDS } from '../src/engine/content/world.ts';

const outdir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'lords');
const artManifest = JSON.parse(await readFile(new URL('../public/art/manifest.json', import.meta.url), 'utf8'));

const stateSrc = await readFile(new URL('../src/engine/state.ts', import.meta.url), 'utf8');
const rulesVersion = stateSrc.match(/export const RULES_VERSION = (\d+)/)?.[1];

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

const COMPLEXITY = {
  forthright: 'forthright — reads at a glance',
  measured: 'measured — rewards a plan',
  subtle: 'subtle — plays the long game',
};

const cards = LORDS.map((lord) => {
  const art = artManifest[`lord-${lord.id}`];
  return `
    <article id="${lord.id}">
      ${art ? `<img src="/art/${esc(art)}" alt="${esc(lord.name)}, ${esc(lord.epithet)}" loading="lazy" width="132" height="165">` : ''}
      <h2>${esc(lord.name)} <span class="muted">— ${esc(lord.epithet)}</span></h2>
      <p class="small muted">${esc(CREEDS[lord.creed].name)} · ${esc(COMPLEXITY[lord.complexity])}${lord.firstBanner ? ' · a good first banner' : ''}</p>
      <p class="archetype">${esc(lord.archetype)}</p>
      <p class="small">${esc(lord.blurb)}</p>
      <p class="small"><b>${esc(lord.perk.label)}</b> (legacy) — ${esc(lord.perk.desc)}</p>
      <p class="small"><b>${esc(lord.signature.name)}</b> (signature, every ${lord.signature.cooldown + 1} seasons) — ${esc(lord.signature.desc)}</p>
      <p class="small italic muted">“${esc(lord.lines.intro)}”</p>
    </article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Twelve Lords — Realms in Embers</title>
  <meta name="description" content="Every claimant to the Ember Throne compared: creeds, archetypes, legacies and signature abilities — from the free, no-account browser strategy game Realms in Embers.">
  <link rel="canonical" href="https://rie.gg/lords/">
  <link rel="icon" href="/favicon.svg">
  <meta property="og:title" content="The Twelve Lords — Realms in Embers">
  <meta property="og:description" content="Every claimant to the Ember Throne compared — pick your banner.">
  <meta property="og:image" content="https://rie.gg/og.png">
  <style>
    body { margin: 0; background: #16100a; color: #ede2c8; font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; }
    main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
    nav.crumbs { margin-bottom: 2rem; font-size: 0.95rem; }
    nav.crumbs a { margin-right: 1rem; }
    h1 { font-size: 2rem; font-weight: normal; letter-spacing: 0.04em; color: #c9a227; margin: 0 0 0.5rem; }
    h2 { font-size: 1.25rem; font-weight: normal; color: #c9a227; margin: 0 0 0.2rem; }
    a { color: #c9a227; }
    b { color: #c9a227; font-weight: 600; }
    p { margin: 0.4rem 0; }
    .small { font-size: 0.92rem; }
    .muted { color: #c7b998; }
    .italic { font-style: italic; }
    .archetype { color: #e0a442; font-style: italic; }
    article { border-top: 1px solid rgba(201, 162, 39, 0.3); padding: 1.6rem 0 1rem; }
    article img { float: right; margin: 0 0 0.8rem 1rem; border: 1px solid rgba(201, 162, 39, 0.5); border-radius: 6px; }
    article::after { content: ''; display: block; clear: both; }
    @media (max-width: 480px) { article img { width: 92px; height: 115px; } }
  </style>
</head>
<body>
<main>
  <nav class="crumbs"><a href="/">Play the game</a> <a href="/codex/">The Codex</a> <a href="/press.html">Press</a></nav>
  <h1>The Twelve Lords</h1>
  <p class="muted">Every claimant to the Ember Throne — how they play, what they keep, and what they do to you.
  Free in the browser, no account, no tracking. Rules v${rulesVersion}; regenerated from the engine itself so this page cannot lie.</p>
  ${cards}
  <p class="small muted" style="margin-top:2rem">Realms in Embers — a turn-based strategy chronicle. <a href="/">Take up a banner.</a></p>
</main>
</body>
</html>
`;

await mkdir(outdir, { recursive: true });
await writeFile(join(outdir, 'index.html'), html);
console.log(`lords export: ${LORDS.length} claimants → public/lords/index.html (rules v${rulesVersion})`);
