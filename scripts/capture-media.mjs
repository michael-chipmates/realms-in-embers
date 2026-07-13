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
// the set piece: leaf through the painted lords before mustering
await page.getByRole('button', { name: 'Seat 1: browse the lords' }).click();
await page.waitForTimeout(1500);
await shot('gallery');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('#setup-seed').fill('readme-tour-7');
await page.waitForTimeout(900);
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1800);
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(900);
await shot('war-table');

// the pause before the seal: muster a company through the confirm card
await page.evaluate(() => {
  const g = window.__game;
  g.select(g.state.players[g.state.current].seatProvince, null);
});
await page.waitForTimeout(700);
const muster = page.locator('.side-panel details:has(summary:text("Muster companies")) .option-btn:not([disabled])').first();
if (await muster.isVisible().catch(() => false)) {
  await muster.click();
  await page.waitForTimeout(1300);
  await shot('confirm');
  await page.getByRole('button', { name: 'Muster them' }).click();
  await page.waitForTimeout(700);
}

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
  g.panTo(t.to); // floating panels may cover the map's edges
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
    const close = page.getByRole('button', { name: 'Close the report' });
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
const ff = (args) => {
  const res = spawnSync('ffmpeg', ['-y', ...args], { stdio: 'pipe' });
  if (res.status !== 0) {
    // keep the webm as evidence and fail honestly (ffmpeg missing/broken)
    throw new Error(`ffmpeg failed (${res.status ?? 'not found'}): ${String(res.stderr).slice(-400)}`);
  }
};
// the press-kit mp4: crisp, small, plays everywhere (a 10 MB gif is not a tour)
ff(['-ss', '0.6', '-i', `${MEDIA}/playthrough.webm`, '-c:v', 'libx264', '-crf', '26',
  '-preset', 'slow', '-vf', 'scale=960:-2', '-pix_fmt', 'yuv420p', '-an', `${MEDIA}/playthrough.mp4`]);
// the README gif: tighter palette, 640px, 7fps — aim well under 3 MB
// (the vellum map's paper grain dithers expensively; fewer colors and a
// coarser bayer keep the sheet calm instead of shimmering)
ff(['-ss', '0.6', '-i', `${MEDIA}/playthrough.webm`, '-vf', 'fps=7,scale=640:-1:flags=lanczos,palettegen=max_colors=112', `${TMP}/pal.png`]);
ff(['-ss', '0.6', '-i', `${MEDIA}/playthrough.webm`, '-i', `${TMP}/pal.png`,
  '-lavfi', 'fps=7,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
  `${MEDIA}/playthrough.gif`]);
// a lossy gifsicle pass roughly halves the vellum grain's cost; skipped
// honestly when gifsicle is not installed (brew install gifsicle)
const gs = spawnSync('gifsicle', ['-O3', '--lossy=80', `${MEDIA}/playthrough.gif`, '-o', `${MEDIA}/playthrough.gif`], { stdio: 'pipe' });
if (gs.status !== 0) console.warn('gifsicle not available: the gif ships unoptimized (~2 MB heavier)');
rmSync(TMP, { recursive: true, force: true });
rmSync(`${MEDIA}/playthrough.webm`, { force: true });
console.log('media written to docs/media/');
