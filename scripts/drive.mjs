// Drive the app through real flows and screenshot each stage.
// node scripts/drive.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: `${outdir}/1-title.png` });

await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outdir}/2-setup.png` });

// pick a deterministic seed so runs are comparable
await page.locator('#setup-seed').fill('drive-test-7');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1600);
const skipOnboarding = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skipOnboarding.isVisible().catch(() => false)) await skipOnboarding.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/3-game.png` });

// select own seat province (click center of canvas area where banner is — instead: use keyboard cycling)
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/4-selected.png` });

// open overlays
await page.keyboard.press('h');
await page.waitForTimeout(500);
await page.screenshot({ path: `${outdir}/5-court.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/6-magic.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('q');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/7-quests.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('d');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/8-diplomacy.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('l');
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/9-ledger.png` });
await page.keyboard.press('Escape');

// end a turn and let the AI move
await page.keyboard.press('e');
await page.waitForTimeout(3500);
await page.screenshot({ path: `${outdir}/10-after-turn.png` });

if (errors.length) {
  console.log('CONSOLE ERRORS:');
  for (const e of [...new Set(errors)]) console.log('  ' + e.slice(0, 300));
  process.exitCode = 1; // drives gate CI-style checks — errors must fail
} else {
  console.log('no console errors');
}
await browser.close();
