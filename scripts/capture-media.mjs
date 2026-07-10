// Capture README media: a short playthrough GIF + crisp screenshots.
//   node scripts/capture-media.mjs [url]
// Output: docs/media/playthrough.gif + docs/media/*.png (requires ffmpeg).
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'fs';

const [url = 'http://localhost:5199'] = process.argv.slice(2);
const MEDIA = 'docs/media';
const TMP = `${MEDIA}/.rec`;
mkdirSync(MEDIA, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: TMP, size: { width: 1280, height: 800 } },
});
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: `${MEDIA}/${name}.png` });

// ---- the tour (also the GIF storyboard)
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2600); // the hall, breathing
await shot('title');
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(600);
await page.locator('#setup-seed').fill('readme-tour-7');
await page.waitForTimeout(900);
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1800);
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(900);
await shot('war-table');

// an attack with the odds preview
await page.evaluate(() => {
  const g = window.__game;
  const army = Object.values(g.state.armies).find((a) => a.owner === g.state.current);
  g.selectArmy(army.id);
});
await page.waitForTimeout(900);
const hostile = await page.evaluate(() => {
  const g = window.__game;
  const t = g.targets.find((t2) => t2.hostile);
  if (!t) return false;
  const p = g.state.provinces[t.to];
  const [x, y] = g.renderer.worldToScreen(p.cx + 0.5, p.cy + 0.5);
  const rect = g.renderer.canvas.getBoundingClientRect();
  return { x: x + rect.left, y: y + rect.top };
});
if (hostile) {
  await page.mouse.click(hostile.x, hostile.y);
  await page.waitForTimeout(1600);
  await shot('odds');
  const give = page.getByRole('button', { name: /Give battle/ });
  if (await give.isVisible().catch(() => false)) {
    await give.click();
    await page.waitForTimeout(2600); // playback surges
    await shot('battle');
    const close = page.getByRole('button', { name: 'Close the account' });
    if (await close.isVisible().catch(() => false)) await close.click();
  }
}
await page.waitForTimeout(500);

// the painted lords
await page.keyboard.press('d');
await page.waitForTimeout(1600);
await shot('diplomacy');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// a season turns
await page.getByRole('button', { name: 'End the Season' }).click();
await page.waitForTimeout(2600);
const choice = page.locator('.event-choice').first();
if (await choice.isVisible().catch(() => false)) {
  await page.waitForTimeout(1400);
  await shot('event');
  await choice.click();
}
await page.waitForTimeout(1200);

await ctx.close(); // flushes the video
await browser.close();

// ---- webm -> optimized gif
const webm = readdirSync(TMP).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(`${TMP}/${webm}`, `${MEDIA}/playthrough.webm`);
const ff = (args) => spawnSync('ffmpeg', ['-y', ...args], { stdio: 'pipe' });
ff(['-i', `${MEDIA}/playthrough.webm`, '-vf', 'fps=10,scale=880:-1:flags=lanczos,palettegen', `${TMP}/pal.png`]);
ff(['-i', `${MEDIA}/playthrough.webm`, '-i', `${TMP}/pal.png`,
  '-lavfi', 'fps=10,scale=880:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4',
  `${MEDIA}/playthrough.gif`]);
rmSync(TMP, { recursive: true, force: true });
rmSync(`${MEDIA}/playthrough.webm`, { force: true });
console.log('media written to docs/media/');
