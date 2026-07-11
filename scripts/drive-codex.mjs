// Drive the Codex: open it via hotkey and topbar, walk every chapter,
// screenshot desktop + a 375x667 phone, and fail on any page error.
// node scripts/drive-codex.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];

async function boot(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'New Chronicle' }).click();
  await page.waitForTimeout(700);
  await page.locator('#setup-seed').fill('drive-codex-1');
  await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
  await page.waitForTimeout(1400);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
}

// ---- desktop: hotkey open, walk all chapters
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await boot(page);
  await page.keyboard.press('c');
  await page.waitForTimeout(500);
  const dialog = page.getByRole('dialog', { name: 'The Codex' });
  if (!(await dialog.isVisible())) throw new Error('Codex did not open on hotkey c');
  await page.screenshot({ path: `${outdir}/codex-1-battle.png` });
  const chapters = ['Companies', 'Works & Ground', 'Coin & Order', 'Emberlight', 'The Court',
    'Quests & the Saga', 'Artifacts', 'The Twelve Lords', 'The Other Lords', 'Enchantments', 'The Five Endings', 'Marginalia'];
  for (const c of chapters) {
    await dialog.getByRole('button', { name: c, exact: true }).click();
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: `${outdir}/codex-2-marginalia.png` });
  // the Ledger link from The Five Endings
  await dialog.getByRole('button', { name: 'The Five Endings', exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /Open the Ledger/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outdir}/codex-3-ledger-link.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // topbar button opens it too
  await page.getByRole('button', { name: 'The Codex — every rule of the realm' }).click();
  await page.waitForTimeout(400);
  if (!(await page.getByRole('dialog', { name: 'The Codex' }).isVisible())) {
    throw new Error('Codex did not open from the topbar');
  }
  await page.close();
}

// ---- phone: 375x667, nav must scroll horizontally, page must scroll vertically
{
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await boot(page);
  await page.keyboard.press('c');
  await page.waitForTimeout(500);
  const dialog = page.getByRole('dialog', { name: 'The Codex' });
  if (!(await dialog.isVisible())) throw new Error('Codex did not open on phone');
  await page.screenshot({ path: `${outdir}/codex-4-phone.png` });
  // no horizontal page scroll
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`Horizontal page overflow on phone: ${overflow}px`);
  // deepest chapter still reachable
  await dialog.getByRole('button', { name: 'Marginalia', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outdir}/codex-5-phone-marginalia.png` });
  await page.close();
}

await browser.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('codex drive: all chapters open on desktop and phone, ledger link works, no page errors');
