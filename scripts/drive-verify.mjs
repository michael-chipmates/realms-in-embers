// Verify onboarding, mobile layout, hotseat handoff, and fog of war.
import { chromium } from 'playwright';
const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];

// --- desktop: onboarding
let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push('desktop: ' + e));
await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(500);
await page.locator('#setup-seed').fill('verify-onboard');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${outdir}/v1-onboarding.png` });
await page.getByRole('button', { name: 'Go on' }).click();
await page.getByRole('button', { name: 'Go on' }).click();
await page.getByRole('button', { name: 'Go on' }).click();
await page.getByRole('button', { name: 'Take the realm' }).click();
await page.waitForTimeout(300);
await page.close();

// --- mobile layout
page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => errors.push('mobile: ' + e));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/v2-mobile-title.png` });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(500);
await page.locator('#setup-seed').fill('verify-mobile');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1400);
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outdir}/v3-mobile-game.png` });
// select a province via keyboard fallback: tap the map center
await page.touchscreen.tap(195, 400);
await page.waitForTimeout(500);
await page.screenshot({ path: `${outdir}/v4-mobile-selected.png` });
await page.close();

// --- hotseat + fog
page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push('hotseat: ' + e));
await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(400);
await page.locator('#setup-seed').fill('verify-hotseat');
await page.locator('#setup-fog').check();
// make seat 2 human
await page.locator('.setup-player-row select').nth(2).selectOption('human');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1400);
await page.getByRole('button', { name: 'I have read the Chronicle before' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outdir}/v5-fog.png` });
await page.keyboard.press('e'); // end turn -> AI plays -> handoff to human 2
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outdir}/v6-handoff.png` });
await page.getByRole('button', { name: 'I take the table' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outdir}/v7-second-human.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
