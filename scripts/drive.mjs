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

// disbanding is irreversible, so the ✕ must arm on the first press and act
// only on the second (Michel, 2026-07-11)
await page.evaluate(() => {
  const g = window.__game;
  const army = Object.values(g.state.armies).find((a) => a.owner === 0 && a.units.length > 0);
  g.selectArmy(army.id);
});
await page.waitForTimeout(400);
const unitsBefore = await page.evaluate(() =>
  Object.values(window.__game.state.armies).filter((a) => a.owner === 0).reduce((s, a) => s + a.units.length, 0));
await page.locator('button[aria-label^="Disband "]').first().click();
await page.waitForTimeout(150);
// arming rewrites the label to the question, so find the armed button itself
const armed = page.locator('.btn-armed');
const armedLabel = await armed.textContent().catch(() => null);
const unitsAfterFirstTap = await page.evaluate(() =>
  Object.values(window.__game.state.armies).filter((a) => a.owner === 0).reduce((s, a) => s + a.units.length, 0));
if (unitsAfterFirstTap !== unitsBefore) { console.error('disband fired on the FIRST tap'); process.exit(1); }
if (!/Disband\?/.test(armedLabel ?? '')) { console.error(`disband button did not arm (label: ${armedLabel})`); process.exit(1); }
await armed.click();
await page.waitForTimeout(300);
const unitsAfterConfirm = await page.evaluate(() =>
  Object.values(window.__game.state.armies).filter((a) => a.owner === 0).reduce((s, a) => s + a.units.length, 0));
if (unitsAfterConfirm !== unitsBefore - 1) { console.error('confirmed disband did not remove exactly one company'); process.exit(1); }
await page.evaluate(() => window.__game.select(null, null));
await page.waitForTimeout(200);

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

// the Navigator mirrors the map both ways: the map's selection is the
// highlighted row, and choosing a row selects on the map
await page.evaluate(() => {
  const g = window.__game;
  g.select(g.state.players[0].seatProvince, null);
});
await page.keyboard.press('p');
await page.waitForTimeout(500);
const seatName = await page.evaluate(() => window.__game.state.provinces[window.__game.state.players[0].seatProvince].name);
const highlighted = await page.locator('.nav-row-selected .nav-name').textContent().catch(() => null);
if (highlighted !== seatName) { console.error(`navigator did not highlight the map's selection (${highlighted} vs ${seatName})`); process.exit(1); }
await page.screenshot({ path: `${outdir}/9b-navigator.png` });
const otherRowName = await page.locator('.nav-row:not(.nav-row-selected) .nav-name').first().textContent();
await page.locator('.nav-row:not(.nav-row-selected)').first().click();
await page.waitForTimeout(300);
const mapSel = await page.evaluate(() => {
  const g = window.__game;
  return g.sel.provinceId === null ? null : g.state.provinces[g.sel.provinceId].name;
});
if (mapSel !== otherRowName) { console.error(`choosing a navigator row did not select on the map (${mapSel} vs ${otherRowName})`); process.exit(1); }
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

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
