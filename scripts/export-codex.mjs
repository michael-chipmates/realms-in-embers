// Export the Codex as static pages: boot the game, open the Codex, walk every
// chapter, and write public/codex/<id>.html — one parchment page per chapter,
// rendered from the same engine constants the game itself uses.
// node scripts/export-codex.mjs [baseUrl] [outdir]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'codex')] =
  process.argv.slice(2);

// Mirrors SECTIONS in src/ui/panels/codex.ts — ids become filenames, titles
// find the nav buttons. If a chapter is added there, add it here.
const SECTIONS = [
  { id: 'battle', title: 'The Field of Battle' },
  { id: 'units', title: 'Companies' },
  { id: 'works', title: 'Works & Ground' },
  { id: 'realm', title: 'Coin & Order' },
  { id: 'magic', title: 'Emberlight' },
  { id: 'heroes', title: 'The Court' },
  { id: 'quests', title: 'Quests & the Saga' },
  { id: 'artifacts', title: 'Artifacts' },
  { id: 'twelve', title: 'The Twelve Lords' },
  { id: 'lords', title: 'The Other Lords' },
  { id: 'enchant', title: 'Enchantments' },
  { id: 'victory', title: 'The Five Endings' },
  { id: 'marginalia', title: 'Marginalia' },
];

// The rules version, read from the engine source so this script cannot drift either.
const stateSrc = await readFile(new URL('../src/engine/state.ts', import.meta.url), 'utf8');
const rulesVersion = stateSrc.match(/export const RULES_VERSION = (\d+)/)?.[1];
if (!rulesVersion) throw new Error('Could not read RULES_VERSION from src/engine/state.ts');

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

const SHARED_CSS = `
      body { margin: 0; background: #16100a; color: #ede2c8; font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; }
      main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
      nav.crumbs { margin-bottom: 2.5rem; font-size: 0.95rem; }
      nav.crumbs a { margin-right: 1rem; }
      h1 { font-size: 2rem; font-weight: normal; letter-spacing: 0.04em; color: #c9a227; margin: 0 0 0.75rem; }
      h4, .settings-head { font-size: 1.15rem; font-weight: normal; color: #c9a227; margin: 1.8rem 0 0.4rem; }
      p { margin: 0.45rem 0; }
      a { color: #c9a227; }
      b { color: #c9a227; font-weight: 600; }
      .small { font-size: 0.92rem; }
      .muted { color: #c7b998; }
      .italic { font-style: italic; }
      .codex-p { margin: 0.45rem 0; }
      .codex-fact { margin: 0.35rem 0; font-size: 0.95rem; }
      .codex-entry { display: flex; gap: 0.65rem; padding: 0.55rem 0; border-top: 1px solid #3a2c18; }
      .codex-entry-glyph { color: #c9a227; flex: none; width: 30px; display: flex; justify-content: center; padding-top: 2px; }
      .codex-entry-body { min-width: 0; }
      .codex-entry-body p { margin: 0.15rem 0; }
      .codex-entry-title { font-weight: 600; color: #e0b83a; }
      .codex-spell .codex-entry-title, .codex-spell-glyph { color: #e07a3a; }
      .codex-sealed { display: flex; align-items: baseline; gap: 0.35rem; margin: 0.25rem 0; }
      .codex-table-wrap { overflow-x: auto; }
      table { border-collapse: collapse; font-size: 0.92rem; }
      th, td { text-align: left; padding: 0.3rem 0.7rem 0.3rem 0; border-bottom: 1px solid #3a2c18; }
      .art-slot { display: block; }
      .art-slot img, img { max-width: 100%; height: auto; }
      .art-codex-entry { flex: none; }
      .art-codex-entry img { width: 56px; height: 56px; object-fit: cover; object-position: center 18%; border-radius: 5px; }
      footer { margin-top: 2.5rem; padding-top: 1.2rem; border-top: 1px solid #3a2c18; font-size: 0.95rem; color: #c7b998; }
      .pager { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2rem; font-size: 0.95rem; }`;

function chapterPage({ id, title, html, description, prev, next }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)} — Realms in Embers Codex</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="canonical" href="https://realmsinembers.com/codex/${id}.html" />
    <style>${SHARED_CSS}
    </style>
  </head>
  <body>
    <main>
      <nav class="crumbs"><a href="/">‹ Play Realms in Embers</a> <a href="/codex/">The Codex</a></nav>
      <h1>${esc(title)}</h1>
      <article>
${html}
      </article>
      <nav class="pager">
        <a href="/codex/${prev.id}.html">‹ ${esc(prev.title)}</a>
        <a href="/codex/${next.id}.html">${esc(next.title)} ›</a>
      </nav>
      <footer>
        <p>A chapter of the Codex, the in-game handbook of
          <a href="/">Realms in Embers</a> — a free turn-based fantasy strategy game in your browser.</p>
        <p>This page is generated from the game's own rules constants — it cannot drift from
          the engine. Rules version ${rulesVersion}.</p>
      </footer>
    </main>
  </body>
</html>
`;
}

function indexPage(chapters) {
  const items = chapters.map((c) =>
    `        <li><a href="/codex/${c.id}.html">${esc(c.title)}</a> — ${esc(c.line)}</li>`).join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>The Codex — Realms in Embers</title>
    <meta name="description" content="The complete rules handbook of Realms in Embers: battle, companies, coin and order, Emberlight, heroes, quests, the twelve lords, and the five endings." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="canonical" href="https://realmsinembers.com/codex/" />
    <style>${SHARED_CSS}
      ul { padding-left: 1.2rem; }
      li { margin: 0 0 0.6rem; }
    </style>
  </head>
  <body>
    <main>
      <nav class="crumbs"><a href="/">‹ Play Realms in Embers</a></nav>
      <h1>The Codex</h1>
      <p>Osperan's complete handbook to <a href="/">Realms in Embers</a>, chapter by chapter.
        In the game it opens with <b>c</b>; these pages are the same book, printed for the
        open web.</p>
      <ul>
${items}
      </ul>
      <footer>
        <p>These pages are generated from the game's own rules constants — they cannot drift
          from the engine. Rules version ${rulesVersion}.</p>
      </footer>
    </main>
  </body>
</html>
`;
}

// ---- drive the game (same route as scripts/drive-codex.mjs)
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(700);
await page.locator('#setup-seed').fill('export-codex-1');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1400);
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(400);
await page.keyboard.press('c');
await page.waitForTimeout(600);
const dialog = page.getByRole('dialog', { name: 'The Codex' });
if (!(await dialog.isVisible())) throw new Error('Codex did not open on hotkey c');

await mkdir(outdir, { recursive: true });
const written = [];
const failed = [];
for (const [i, section] of SECTIONS.entries()) {
  try {
    await dialog.getByRole('button', { name: section.title, exact: true }).click();
    await page.waitForTimeout(600); // chapter render + eager art swap-in
    const captured = await page.evaluate(() => {
      const src = document.querySelector('.codex-modal .codex-page');
      if (!src) return null;
      const clone = src.cloneNode(true);
      // static pages keep the reading matter, not the controls or the modal chrome
      for (const el of clone.querySelectorAll(
        'script, button, input, select, textarea, .codex-pager, .codex-page-head, .codex-hint',
      )) el.remove();
      // art is served from /art/ at the site root; these pages live under /codex/
      for (const img of clone.querySelectorAll('img')) {
        const s = img.getAttribute('src');
        if (s && !s.startsWith('/') && !s.startsWith('http') && !s.startsWith('data:')) {
          img.setAttribute('src', `/${s}`);
        }
      }
      // stripped controls can leave hollow wrappers behind
      for (const el of clone.querySelectorAll('div, span')) {
        if (el.textContent.trim() === '' && !el.querySelector('img, svg')) el.remove();
      }
      // block-by-block text, so sentences don't fuse across paragraph borders
      const blocks = Array.from(clone.querySelectorAll('p, h4, li, div.codex-entry-title'))
        .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return { html: clone.innerHTML, text: blocks.join(' ') };
    });
    if (!captured || captured.html.trim() === '') throw new Error('empty capture');
    if (/<script\b/i.test(captured.html)) throw new Error('capture contains a <script> tag');

    const cut = (s, max) => {
      if (s.length <= max) return s;
      const clipped = s.slice(0, max);
      return `${clipped.slice(0, clipped.lastIndexOf(' '))}…`;
    };
    const description = cut(captured.text, 155);
    const firstSentence = captured.text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? captured.text;
    const prev = SECTIONS[(i - 1 + SECTIONS.length) % SECTIONS.length];
    const next = SECTIONS[(i + 1) % SECTIONS.length];
    const html = chapterPage({ ...section, html: captured.html, description, prev, next });
    await writeFile(join(outdir, `${section.id}.html`), html);
    written.push({ ...section, line: cut(firstSentence, 160), bytes: Buffer.byteLength(html) });
  } catch (err) {
    failed.push({ ...section, err: String(err) });
  }
}

if (written.length > 0) {
  await writeFile(join(outdir, 'index.html'), indexPage(written));
}
await browser.close();

if (errors.length > 0) console.error('PAGE ERRORS (non-fatal for export):\n' + errors.join('\n'));
for (const w of written) console.log(`  ${w.id}.html  ${(w.bytes / 1024).toFixed(1)} KB  — ${w.title}`);
const total = written.reduce((n, w) => n + w.bytes, 0);
console.log(`codex export: ${written.length}/${SECTIONS.length} chapters + index → ${outdir} (${(total / 1024).toFixed(0)} KB of chapters)`);
const oversized = written.filter((w) => w.bytes > 100 * 1024);
if (oversized.length > 0) console.error(`OVERSIZED (>100 KB): ${oversized.map((w) => w.id).join(', ')}`);
if (failed.length > 0) {
  console.error(`FAILED: ${failed.map((f) => `${f.id} (${f.err})`).join('; ')}`);
  process.exit(1);
}
