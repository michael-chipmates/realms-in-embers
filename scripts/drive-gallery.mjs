// Drive the lord gallery end to end:
//  1) Quick War routes through the gallery and the picked banner is honored.
//  2) The gallery stays usable at 375x667 and 320x568 (scroll-safe rule).
//  3) Online: two players pick the SAME lord — the earlier relay seq keeps
//     it, the later pick auto-clears, and the started war honors the winner.
// node scripts/drive-gallery.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];
const watch = (page, label) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${String(e)}`));
};

// ---- 1) solo: Quick War -> gallery -> second lord -> the game honors it
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page, 'solo');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Quick War' }).click();
  await page.getByRole('button', { name: /Standard/ }).click();
  await page.waitForTimeout(500);
  const overlay = page.locator('.gallery-overlay');
  if (!(await overlay.isVisible())) throw new Error('gallery did not open from Quick War');
  await page.screenshot({ path: `${outdir}/gallery-1-solo.png` });
  await page.getByRole('button', { name: 'Next lord' }).click(); // aldric
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Take up this banner' }).click();
  await page.waitForTimeout(1600);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(300);
  const lordId = await page.evaluate(() => {
    const s = window.__game.state;
    return s.players[0].lordId;
  });
  if (lordId !== 'aldric') throw new Error(`picked aldric, got ${lordId}`);
  await page.close();
}

// ---- 2) phones: everything reachable, nothing clipped
for (const vp of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
  const page = await browser.newPage({ viewport: vp });
  watch(page, `phone${vp.width}`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Quick War' }).click();
  await page.getByRole('button', { name: /Gentle/ }).click();
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`horizontal overflow at ${vp.width}px: ${overflow}px`);
  const btn = page.getByRole('button', { name: 'Take up this banner' });
  await btn.scrollIntoViewIfNeeded();
  if (!(await btn.isVisible())) throw new Error(`banner button unreachable at ${vp.width}px`);
  await page.screenshot({ path: `${outdir}/gallery-2-phone-${vp.width}.png` });
  await page.close();
}

// ---- 3) online: contested banner, earlier seq wins, the war honors it
const relay = spawn('node', ['server/relay.mjs', '8789'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 700));
try {
  const mk = async (label) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('rie-relay', 'ws://localhost:8789'));
    watch(page, label);
    return page;
  };
  const a = await mk('A');
  const b = await mk('B');
  await a.goto(url, { waitUntil: 'networkidle' });
  await a.getByRole('button', { name: 'Play with Friends' }).click();
  await a.waitForSelector('.lobby-invite input');
  await a.fill('input[placeholder="Your name at the table"]', 'Alaric');
  await a.getByRole('button', { name: 'Take a seat' }).click();
  await a.waitForTimeout(400);
  const invite = await a.inputValue('.lobby-invite input');

  await b.goto(invite, { waitUntil: 'networkidle' });
  await b.waitForSelector('.lobby-invite input');
  await b.fill('input[placeholder="Your name at the table"]', 'Berta');
  await b.getByRole('button', { name: 'Take a seat' }).click();
  await b.waitForTimeout(500);

  // both reach for Seraphine — galleries open BEFORE either pick lands, so
  // this is the true race the earlier-seq rule exists for (a gallery opened
  // after A's echo would already show the banner as claimed and refuse)
  await a.getByRole('button', { name: 'Choose your banner' }).click();
  await b.getByRole('button', { name: 'Choose your banner' }).click();
  await a.getByRole('button', { name: 'Take up this banner' }).click();
  await a.waitForTimeout(600);
  await b.getByRole('button', { name: 'Take up this banner' }).click();
  await b.waitForTimeout(900);

  const bStatus = await b.locator('p[aria-live="polite"]').textContent();
  const bRow = await b.locator('.lobby-row', { hasText: 'Berta' }).textContent();
  if (!bRow.includes('fate decides')) throw new Error(`B's contested pick did not clear: ${bRow} (status: ${bStatus})`);
  const aRow = await a.locator('.lobby-row', { hasText: 'Alaric' }).textContent();
  if (!aRow.includes('Seraphine')) throw new Error(`A lost a banner claimed first: ${aRow}`);
  await b.screenshot({ path: `${outdir}/gallery-3-conflict.png` });

  // the started war honors A's banner
  await a.selectOption('.lobby-field:nth-of-type(3) select', { index: 0 });
  await a.getByRole('button', { name: 'Begin the war' }).click();
  await a.waitForSelector('.end-turn', { timeout: 15000 });
  await b.waitForSelector('.end-turn', { timeout: 15000 });
  const seatLord = await a.evaluate(() => window.__game.state.players[0].lordId);
  if (seatLord !== 'seraphine') throw new Error(`war did not honor the pick: seat0=${seatLord}`);
  await a.close();
  await b.close();
} finally {
  relay.kill();
}

await browser.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('gallery drive: solo pick honored, 375+320 scroll-safe, contested banner resolves to the earlier seq, war honors the pick');
