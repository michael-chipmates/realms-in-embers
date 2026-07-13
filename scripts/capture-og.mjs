// The link-preview card (og:image): the one image Reddit, Discord, and
// friends show for rie.gg. Composed live from the game itself: the vellum
// war table angled on the candlelit hall, wordmark and tagline beside it.
//   node scripts/capture-og.mjs [url]
// Output: public/og-card.jpg (1200x630, rendered at 2x). Requires sharp.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import sharp from 'sharp';

const [url = 'http://localhost:5199'] = process.argv.slice(2);
const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'rie-og-'));

const browser = await chromium.launch();

// ---- the map plate: a clean fitted board, one army selected for life
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New Chronicle' }).click();
  await page.waitForTimeout(400);
  await page.locator('#setup-seed').fill('readme-tour-7');
  await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
  await page.waitForTimeout(1600);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const g = window.__game;
    const army = Object.values(g.state.armies).find((a) => a.owner === g.state.current);
    if (army) g.selectArmy(army.id);
  });
  await page.addStyleTag({ content: '.topbar,.side-panel,.chronicle-panel,.alerts-row,.map-zoom,.toasts,.guide-card{display:none !important}' });
  await page.evaluate(() => { const g = window.__game; g.renderer.resize(); g.renderer.fit(0); g.redrawMap(); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(tmp, 'og-map.png') });
  await page.close();
}

// ---- the card: hall backdrop, wordmark stack, the map as a sheet in wax
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'IM Fell English'; font-style: italic;
    src: url('file://${resolve(root, 'public/fonts/im-fell-english-italic.woff2')}') format('woff2'); }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; overflow:hidden; position:relative;
    font-family:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif; background:#0d0906; }
  .hall { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center 30%; filter:saturate(.95); }
  .veil { position:absolute; inset:0;
    background:
      radial-gradient(ellipse 90% 120% at 22% 45%, rgba(10,6,2,0.35) 0%, rgba(10,6,2,0.72) 55%, rgba(6,3,1,0.9) 100%),
      linear-gradient(90deg, rgba(8,5,2,0.82) 0%, rgba(8,5,2,0.55) 38%, rgba(8,5,2,0.12) 62%, rgba(8,5,2,0.35) 100%); }
  .map-wrap { position:absolute; right:-70px; top:52px; width:660px; transform:rotate(3.2deg); }
  .map { display:block; width:100%; border-radius:4px;
    box-shadow: 0 40px 90px rgba(0,0,0,0.85), 0 8px 26px rgba(0,0,0,0.6); }
  .map-seal { position:absolute; left:-26px; bottom:-22px; width:88px; height:88px; border-radius:50%;
    background:radial-gradient(circle at 34% 28%, #b8483a, #8a2f26 58%, #571b15);
    box-shadow:0 8px 22px rgba(0,0,0,0.65), inset 0 2px 6px rgba(255,180,140,0.25);
    display:flex; align-items:center; justify-content:center; transform:rotate(-9deg); }
  .map-seal .ring { width:56px; height:56px; border-radius:50%; border:2px solid rgba(255,220,190,0.32);
    display:flex; align-items:center; justify-content:center; }
  .map-seal .diamond { width:16px; height:16px; background:linear-gradient(135deg,#ffcf8a,#e07830); transform:rotate(45deg); }
  .stack { position:absolute; left:64px; top:0; bottom:0; width:520px; display:flex; flex-direction:column; justify-content:center; }
  .over { font-size:17px; letter-spacing:0.38em; text-transform:uppercase; color:#b7a888; font-style:italic; }
  .wordmark { margin-top:20px; font-size:76px; line-height:1.04; letter-spacing:0.12em; text-transform:uppercase;
    color:#e6c14a; text-shadow:0 0 38px rgba(230,193,74,0.35), 0 3px 0 rgba(0,0,0,0.8); }
  .rule { margin-top:26px; display:flex; align-items:center; gap:16px; width:390px; }
  .rule .line { flex:1; height:1px; }
  .rule .l1 { background:linear-gradient(90deg, transparent, #8a7020); }
  .rule .l2 { background:linear-gradient(90deg, #8a7020, transparent); }
  .rule .diamond { width:11px; height:11px; background:linear-gradient(135deg,#ffb35c,#e07830);
    transform:rotate(45deg); box-shadow:0 0 14px rgba(224,120,48,0.8); }
  .tag { margin-top:24px; font-family:'IM Fell English',serif; font-style:italic; font-size:27px; line-height:1.45; color:#d8c9a6; max-width:430px; }
  .proof { margin-top:30px; font-size:16.5px; letter-spacing:0.24em; text-transform:uppercase; color:#8a7020; }
  .proof b { color:#c9a227; font-weight:400; }
</style></head><body>
  <img class="hall" src="file://${resolve(root, 'public/art/title-hall.webp')}">
  <div class="veil"></div>
  <div class="map-wrap">
    <img class="map" src="file://${join(tmp, 'og-map.png')}">
    <div class="map-seal"><div class="ring"><div class="diamond"></div></div></div>
  </div>
  <div class="stack">
    <div class="over">Forty years after the Sundering</div>
    <div class="wordmark">Realms<br>in Embers</div>
    <div class="rule"><div class="line l1"></div><div class="diamond"></div><div class="line l2"></div></div>
    <div class="tag">The throne is cold. The chronicler is not quite dead. The war for the ashes begins with you.</div>
    <div class="proof"><b>Free</b> · in the browser · <b>no account</b></div>
  </div>
</body></html>`;
writeFileSync(join(tmp, 'og-card.html'), html);

{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.goto(`file://${join(tmp, 'og-card.html')}`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(tmp, 'og-card-2x.png') });
  await page.close();
}
await browser.close();

const info = await sharp(join(tmp, 'og-card-2x.png'))
  .resize(1200, 630)
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(resolve(root, 'public/og-card.jpg'));
rmSync(tmp, { recursive: true, force: true });
console.log(`public/og-card.jpg written (${(info.size / 1024).toFixed(0)} KB)`);
