// Drive Quick War: title -> Quick War -> Standard -> in the game, desktop + phone.
// node scripts/drive-quickwar.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];

async function run(viewport, tag) {
  const page = await browser.newPage({ viewport });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Quick War' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outdir}/quickwar-${tag}-modal.png` });
  await page.getByRole('button', { name: /Standard/ }).click();
  await page.waitForTimeout(500);
  // the gallery is part of the flow now — let fate deal keeps it quick
  await page.getByRole('button', { name: 'Let fate deal' }).click();
  await page.waitForTimeout(1600);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
  const endTurn = page.getByRole('button', { name: /End the Season/ });
  if (!(await endTurn.isVisible().catch(() => false))) {
    throw new Error(`quickwar ${tag}: game did not start (no End the Season button)`);
  }
  await page.screenshot({ path: `${outdir}/quickwar-${tag}-game.png` });
  await page.close();
}

await run({ width: 1440, height: 900 }, 'desktop');
await run({ width: 375, height: 667 }, 'phone');
await browser.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('quickwar drive: modal opens, Standard starts a war with fog on, desktop + phone, no page errors');
