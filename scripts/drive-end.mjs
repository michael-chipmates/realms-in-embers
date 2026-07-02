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
const sagaBtn = page.getByRole('button', { name: 'Read the finished Saga' });
if (await sagaBtn.isVisible().catch(() => false)) {
  await sagaBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outdir}/e3-saga.png` });
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors', '| event seen:', eventShot);
await browser.close();
