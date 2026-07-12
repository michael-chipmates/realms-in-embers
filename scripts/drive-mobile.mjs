// Full mobile play loop at iPhone size: tap-select, attack, odds, battle,
// clear selection, end turn, AI wheel — asserting zero page errors.
import { chromium } from 'playwright';
const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(500);

// Michel's phone bugs (2026-07-11): setup must fit the viewport width and
// must scroll under a real touch gesture; the sheet must too (below).
const cdp = await page.context().newCDPSession(page);
// Drag a synthetic finger (raw touch events). Input.synthesizeScrollGesture
// with gestureSourceType 'touch' silently does nothing on Linux headless
// chromium (CI), so the gesture is built from dispatchTouchEvent instead —
// which is also closer to a real thumb. dy < 0 drags the finger up, i.e.
// the content scrolls down (scrollTop grows).
const touchScroll = async (x, y, dy) => {
  let remaining = dy;
  while (remaining !== 0) {
    const chunk = Math.max(-320, Math.min(320, remaining));
    const startY = chunk < 0 ? Math.min(y, 700) : Math.max(y, 140);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY + (chunk * i) / steps }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    remaining -= chunk;
  }
  await page.waitForTimeout(400);
};
const wide = await page.evaluate(() =>
  [...document.querySelectorAll('.setup-screen *')]
    .filter((n) => n.getBoundingClientRect().right > window.innerWidth + 1 && n.getBoundingClientRect().width > 30)
    .map((n) => `${n.tagName}.${n.className}`).slice(0, 8));
if (wide.length) { console.error('setup overflows viewport width:', wide); process.exit(1); }
await touchScroll(200, 500, -300);
const setupScrolled = await page.evaluate(() => document.querySelector('.setup-screen').scrollTop);
if (setupScrolled === 0) { console.error('setup did not scroll under touch'); process.exit(1); }
await touchScroll(200, 400, 600); // back to the top

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

// the bottom sheet: must be its own touch surface (pointer-events auto) and
// must scroll so recruit/move/build stay reachable on phones
const sheetCheck = await page.evaluate(() => {
  const el = document.querySelector('.side-panel');
  const cs = getComputedStyle(el);
  return { pe: cs.pointerEvents, top: el.getBoundingClientRect().top, scrollable: el.scrollHeight > el.clientHeight };
});
if (sheetCheck.pe !== 'auto') { console.error('sheet is not a touch surface (pointer-events)'); process.exit(1); }
if (sheetCheck.scrollable) {
  await touchScroll(195, sheetCheck.top + 120, -200);
  const sheetScrolled = await page.evaluate(() => document.querySelector('.side-panel').scrollTop);
  if (sheetScrolled === 0) { console.error('sheet did not scroll under touch'); process.exit(1); }
  await touchScroll(195, sheetCheck.top + 120, 400);
}

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

// ONE bar, ONE row (Michel, 2026-07-12): no bottom chrome, the topbar must
// not wrap, and the drawers button reaches every overlay
if (await page.locator('.mode-bar').count() > 0) { console.error('the bottom mode bar is back'); process.exit(1); }
const barH = await page.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().height);
if (barH > 64) { console.error(`topbar wraps on a phone (${Math.round(barH)}px tall)`); process.exit(1); }
const drawersBtn = page.locator('.topbar-drawers');
if (!(await drawersBtn.isVisible())) { console.error('drawers button missing on a phone'); process.exit(1); }
await drawersBtn.click();
await page.waitForTimeout(400);
const drawerRows = await page.locator('.drawer-row').count();
if (drawerRows < 9) { console.error(`drawers sheet lists ${drawerRows} rows, wanted 10ish`); process.exit(1); }
await page.screenshot({ path: `${outdir}/m5b-drawers.png` });
await page.getByRole('button', { name: /Ledger & victory/ }).click();
await page.waitForTimeout(500);
if (!(await page.getByText('The Realm Ledger').isVisible().catch(() => false))) {
  console.error('drawers row did not open the Ledger'); process.exit(1);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// clear the selection sheet
await page.evaluate(() => window.__game.select(null, null));
await page.waitForTimeout(200);
// end the season -> AI turns
const end = page.getByRole('button', { name: 'End the Season' });
await end.click();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${outdir}/m5-after-turn.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
if (errors.length) process.exitCode = 1;

// --- the 320 px pass: the smallest phones get the same promises —
// setup fits the width, and the war table's own overlays fit too
{
  const p320 = await browser.newPage({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  const errors320 = [];
  p320.on('pageerror', (e) => errors320.push(String(e)));
  await p320.goto(url, { waitUntil: 'networkidle' });
  await p320.getByRole('button', { name: 'New Chronicle' }).click();
  await p320.waitForTimeout(600);
  const wide320 = await p320.evaluate(() =>
    [...document.querySelectorAll('.setup-screen *')]
      .filter((n) => n.getBoundingClientRect().right > window.innerWidth + 1 && n.getBoundingClientRect().width > 30)
      .map((n) => `${n.tagName}.${n.className}`).slice(0, 6));
  if (wide320.length) { console.error('setup overflows a 320px viewport:', wide320); process.exit(1); }
  await p320.locator('#setup-seed').fill('mobile-320-1');
  await p320.getByRole('button', { name: 'Begin the Chronicle' }).click();
  await p320.waitForTimeout(1400);
  const skip320 = p320.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip320.isVisible().catch(() => false)) await skip320.click();
  await p320.waitForTimeout(400);
  await p320.keyboard.press('b');
  await p320.waitForTimeout(400);
  const briefWide = await p320.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
  if (briefWide) { console.error('an overlay overflows the 320px viewport'); process.exit(1); }
  await p320.screenshot({ path: `${outdir}/m6-320.png` });
  if (errors320.length) { console.error('320px PAGE ERRORS:\n' + errors320.join('\n')); process.exit(1); }
  console.log('320px: setup and overlays fit, no page errors');
  await p320.close();
}
await browser.close();
