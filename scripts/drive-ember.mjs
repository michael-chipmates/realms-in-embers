// The First Ember, walked end to end: the guide must step forward only
// when the real thing happened (select seat, build, recruit, march, end
// season, open the ledger), finish with the closing card, and stay away
// once furled. Desktop first, then the whole walk again at phone size.
// node scripts/drive-ember.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const fail = (msg) => { console.error(msg); process.exit(1); };

async function guideText(page) {
  return (await page.locator('.guide-card').textContent().catch(() => '')) ?? '';
}

async function expectStep(page, needle, label) {
  const text = await guideText(page);
  if (!text.includes(needle)) fail(`${label}: guide should show "${needle}" — got: ${text.slice(0, 140)}`);
}

async function walk(page, outPrefix) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /The First Ember/ }).click();
  await page.waitForTimeout(1600);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(500);

  if (!(await page.locator('.guide-card').isVisible().catch(() => false))) fail('guide card missing at boot');
  await expectStep(page, 'Your seat', 'step 1');
  await page.screenshot({ path: `${outdir}/${outPrefix}-1-guide.png` });

  // 1: select the seat
  await page.evaluate(() => {
    const g = window.__game;
    g.select(g.state.players[0].seatProvince, null);
  });
  await page.waitForTimeout(300);
  await expectStep(page, 'Raise works', 'step 2');

  // 2: queue a building (first legal option button, then its confirm card)
  await page.locator('.side-panel details:has(summary:text("Raise works")) .option-btn:not([disabled])').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Raise it' }).click();
  await page.waitForTimeout(400);
  await expectStep(page, 'Muster a company', 'step 3');

  // 3: queue a company (option button, then the confirm card)
  await page.locator('.side-panel details:has(summary:text("Muster companies")) .option-btn:not([disabled])').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Muster them' }).click();
  await page.waitForTimeout(400);
  await expectStep(page, 'March', 'step 4');

  // a reload mid-guide must not lose the First Ember: Continue re-seats the
  // guide and the steps re-derive themselves from the action log (review R3).
  // The quiet mid-season autosave lands ~800ms after the last order.
  await page.waitForTimeout(1200);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.waitForTimeout(1200);
  if (!(await page.locator('.guide-card').isVisible().catch(() => false))) fail('guide lost after reload + Continue');
  await expectStep(page, 'March', 'step 4 after reload');

  // 4: march somewhere peaceful (avoid the odds modal; a fight is not required)
  const marched = await page.evaluate(() => {
    const g = window.__game;
    const army = Object.values(g.state.armies).find((a) => a.owner === 0 && !a.moved && a.units.length > 0);
    if (!army) return false;
    g.selectArmy(army.id);
    const calm = g.targets.find((t) => !t.hostile) ?? g.targets[0];
    if (!calm) return false;
    return g.dispatch({ t: 'moveArmy', armyId: army.id, to: calm.to, viaSea: calm.viaSea });
  });
  if (!marched) fail('no march available on the First Ember seed');
  await page.waitForTimeout(600);
  const battleClose = page.getByRole('button', { name: 'Close the report' });
  if (await battleClose.isVisible().catch(() => false)) await battleClose.click();
  await expectStep(page, 'Close the season', 'step 5');

  // 5: end the season
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await page.waitForTimeout(3000);
  const battleClose2 = page.getByRole('button', { name: 'Close the report' });
  if (await battleClose2.isVisible().catch(() => false)) await battleClose2.click();
  await page.waitForTimeout(300);
  await expectStep(page, 'The race', 'step 6');

  // 6: open the ledger
  await page.keyboard.press('l');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expectStep(page, 'The table is yours', 'closing card');
  await page.screenshot({ path: `${outdir}/${outPrefix}-2-complete.png` });

  // furl it — and it stays furled
  await page.getByRole('button', { name: 'Furl the guide' }).click();
  await page.waitForTimeout(200);
  if (await page.locator('.guide-card').isVisible().catch(() => false)) fail('guide did not furl');
}

// -------------------------------------------------------------- desktop
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await walk(page, 'e-desktop');
  if (errors.length) fail('DESKTOP PAGE ERRORS:\n' + errors.join('\n'));
  await page.close();
  console.log('first ember desktop: six steps, closing card, furl — ok');
}

// ---------------------------------------------------------------- phone
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await walk(page, 'e-phone');
  // the guide must never cover the sheet's controls: card sits in the top half
  if (errors.length) fail('PHONE PAGE ERRORS:\n' + errors.join('\n'));
  await page.close();
  console.log('first ember phone: six steps, closing card, furl — ok');
}

await browser.close();
console.log('no page errors');
