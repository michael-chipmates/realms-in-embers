// The battle theater, driven end to end: a real battle through the odds
// modal must open as a staged scene (stakes with the augurs' number, rounds
// revealing, speed presets, skip to a full aftermath) — and the same battle
// under reduced motion must fall back to the still report.
// node scripts/drive-battle.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const fail = (msg) => { console.error(msg); process.exit(1); };

async function bootGame(page, seed) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New Chronicle' }).click();
  await page.waitForTimeout(600);
  await page.locator('#setup-seed').fill(seed);
  await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
  await page.waitForTimeout(1600);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
}

/** March an army into the first hostile field available, ending seasons
 * until one exists. Returns once the odds modal is open. */
async function reachOddsModal(page) {
  for (let season = 0; season < 8; season++) {
    const found = await page.evaluate(() => {
      const g = window.__game;
      for (const army of Object.values(g.state.armies)) {
        if (army.owner !== 0 || army.moved || army.units.length === 0) continue;
        g.selectArmy(army.id);
        const hostile = g.targets.find((t) => t.hostile);
        if (hostile) {
          const p = g.state.provinces[hostile.to];
          const [x, y] = g.renderer.worldToScreen(p.cx + 0.5, p.cy + 0.5);
          const rect = g.renderer.canvas.getBoundingClientRect();
          return { x: x + rect.left, y: y + rect.top };
        }
        g.select(null, null);
      }
      return null;
    });
    if (found) {
      await page.mouse.click(found.x, found.y);
      await page.waitForTimeout(600);
      if (await page.getByRole('button', { name: /Give battle/ }).isVisible().catch(() => false)) return;
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('e');
    await page.waitForTimeout(2500);
  }
  fail('never found a hostile field to test the theater on');
}

// ------------------------------------------------------- act 1: theater
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootGame(page, 'mobile-loop-4');
  await reachOddsModal(page);
  await page.getByRole('button', { name: /Give battle/ }).click();
  await page.waitForTimeout(700);

  if (!(await page.locator('.theater-stakes').isVisible().catch(() => false))) fail('theater did not open with a stakes card');
  if (!(await page.locator('.theater-stakes').textContent()).includes('The augurs gave')) {
    fail('the stakes card lost the augurs\' number from the odds modal');
  }
  if ((await page.locator('.theater-speed').count()) !== 3) fail('speed presets missing');
  await page.screenshot({ path: `${outdir}/t1-stakes.png` });

  // rounds reveal over time
  await page.waitForTimeout(1300);
  const midRounds = await page.locator('.theater-rounds .battle-round').count();
  if (midRounds < 1) fail('no rounds revealed during playback');

  await page.getByRole('button', { name: 'Skip to the outcome' }).click();
  await page.waitForTimeout(400);
  const aftermath = page.locator('.theater-aftermath');
  if (!(await aftermath.isVisible())) fail('skip did not reach the aftermath');
  if (!/holds the field/.test(await aftermath.textContent())) fail('aftermath has no verdict line');
  if ((await page.locator('.theater-aftermath .battle-unit-row').count()) < 1) fail('aftermath lists no company losses');
  await page.screenshot({ path: `${outdir}/t2-aftermath.png` });
  await page.getByRole('button', { name: 'Close the report' }).click();
  await page.waitForTimeout(300);

  if (errors.length) fail('THEATER PAGE ERRORS:\n' + errors.join('\n'));
  await page.close();
  console.log('theater: stakes, playback, speeds, aftermath — ok');
}

// -------------------------------------- act 2: reduced-motion fallback
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootGame(page, 'mobile-loop-4');
  await reachOddsModal(page);
  await page.getByRole('button', { name: /Give battle/ }).click();
  await page.waitForTimeout(700);

  if (await page.locator('.theater-stakes').isVisible().catch(() => false)) {
    fail('reduced motion must open the still report, not the theater');
  }
  if (!(await page.locator('.battle-rounds').isVisible().catch(() => false))) fail('still report did not open under reduced motion');
  await page.screenshot({ path: `${outdir}/t3-reduced-still.png` });
  await page.getByRole('button', { name: 'Close the report' }).click();
  if (errors.length) fail('REDUCED-MOTION PAGE ERRORS:\n' + errors.join('\n'));
  await page.close();
  console.log('reduced motion: still report fallback — ok');
}

await browser.close();
console.log('no page errors');
