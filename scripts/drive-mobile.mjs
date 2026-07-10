// Full mobile play loop at iPhone size: tap-select, attack, odds, battle,
// overlay, end turn, long-press tooltip.
import { chromium } from 'playwright';
const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(500);
await page.locator('#setup-seed').fill('mobile-loop-4');
await page.waitForTimeout(300);
await page.screenshot({ path: `${outdir}/m1-setup.png` });
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1400);
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(400);

// tap own seat -> bottom sheet with province + army
const seat = await page.evaluate(() => {
  const g = window.__game;
  const p = g.state.provinces[g.state.players[0].seatProvince];
  const [x, y] = g.renderer.worldToScreen(p.cx + 0.5, p.cy + 0.5);
  const rect = g.renderer.canvas.getBoundingClientRect();
  return { x: x + rect.left, y: y + rect.top };
});
await page.touchscreen.tap(seat.x, seat.y);
await page.waitForTimeout(500);
await page.screenshot({ path: `${outdir}/m2-province-sheet.png` });

// select army + tap a hostile target -> odds modal
const target = await page.evaluate(() => {
  const g = window.__game;
  const army = Object.values(g.state.armies).find((a) => a.owner === 0);
  g.selectArmy(army.id);
  const hostile = g.targets.find((t) => t.hostile);
  if (!hostile) return null;
  const p = g.state.provinces[hostile.to];
  const [x, y] = g.renderer.worldToScreen(p.cx + 0.5, p.cy + 0.5);
  const rect = g.renderer.canvas.getBoundingClientRect();
  return { x: x + rect.left, y: y + rect.top };
});
await page.waitForTimeout(300);
if (target) {
  await page.touchscreen.tap(target.x, target.y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outdir}/m3-odds.png` });
  await page.getByRole('button', { name: 'Give battle' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outdir}/m4-battle.png` });
  const close = page.getByRole('button', { name: 'Close the report' });
  if (await close.isVisible().catch(() => false)) await close.click();
}

// court overlay on phone
await page.evaluate(() => window.__game.select(null, null));
await page.waitForTimeout(200);
// end the season -> AI turns
const end = page.getByRole('button', { name: 'End the Season' });
await end.click();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${outdir}/m5-after-turn.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
