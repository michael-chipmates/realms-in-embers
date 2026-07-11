// Drive to the end screen: short chronicle, then saga export + event check.
import { chromium } from 'playwright';
const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(500);
await page.locator('#setup-seed').fill('drive-end-2');
await page.locator('#setup-length').selectOption('40');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1300);
await page.getByRole('button', { name: 'I have read the Chronicle before' }).click();

// shrink the chronicle to 6 seasons via the dev hook (test-only surgery)
await page.evaluate(() => { window.__game.state.victory.maxTurns = 6; });

let eventShot = false;
for (let i = 0; i < 10; i++) {
  const over = await page.evaluate(() => window.__game.state.phase === 'ended');
  if (over) break;
  // resolve any event modal
  const choice = page.locator('.event-choice').first();
  if (await choice.isVisible().catch(() => false)) {
    if (!eventShot) {
      await page.screenshot({ path: `${outdir}/e1-event.png` });
      eventShot = true;
    }
    await choice.click();
    await page.waitForTimeout(400);
  }
  const btn = page.getByRole('button', { name: 'End the Season' });
  if (await btn.isEnabled().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(2600);
  } else {
    await page.waitForTimeout(1200);
  }
}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outdir}/e2-gameend.png` });

// the debrief: turning points render when the stats gave any, and the share
// card must actually produce a PNG download
const endText = await page.locator('.gameend-body').textContent().catch(() => '');
if (!/Final standings/.test(endText ?? '')) { console.error('end screen missing standings'); process.exit(1); }
const shareBtn = page.getByRole('button', { name: 'Keep a share card (PNG)' });
if (!(await shareBtn.isVisible().catch(() => false))) { console.error('share card button missing'); process.exit(1); }
const download = page.waitForEvent('download', { timeout: 15000 });
await shareBtn.click();
const dl = await download;
if (!/realms-in-embers-.*\.png/.test(dl.suggestedFilename())) {
  console.error(`share card produced ${dl.suggestedFilename()}, wanted a realm PNG`); process.exit(1);
}
const seedBtn = page.getByRole('button', { name: 'Copy the seed link' });
if (!(await seedBtn.isVisible().catch(() => false))) { console.error('seed link button missing'); process.exit(1); }

const sagaBtn = page.getByRole('button', { name: 'Read the finished Saga' });
if (await sagaBtn.isVisible().catch(() => false)) {
  await sagaBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outdir}/e3-saga.png` });
}

// a seed link opens the muster table with the realm pinned (fresh load —
// a hash-only goto would be a same-document navigation)
await page.goto('about:blank');
await page.goto(`${url}/#seed=drive-end-2`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const pinned = await page.locator('#setup-seed').inputValue().catch(() => '');
if (pinned !== 'drive-end-2') { console.error(`seed link did not pin the seed (got "${pinned}")`); process.exit(1); }

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors', '| event seen:', eventShot, '| share card + seed link ok');
if (errors.length) process.exitCode = 1;
await browser.close();
