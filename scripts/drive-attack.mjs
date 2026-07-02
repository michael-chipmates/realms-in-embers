// Verify the attack flow: select army, open odds preview, give battle.
import { chromium } from 'playwright';
const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(600);
await page.locator('#setup-seed').fill('drive-attack-3');
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1500);

// select own army via the dev hook, then click a hostile target province
const info = await page.evaluate(() => {
  const g = window.__game;
  const state = g.state;
  const army = Object.values(state.armies).find((a) => a.owner === state.current);
  g.selectArmy(army.id);
  const targets = g.targets;
  const hostile = targets.find((t) => t.hostile);
  const p = state.provinces[hostile.to];
  const [x, y] = g.renderer.worldToScreen(p.cx + 0.5, p.cy + 0.5);
  const rect = g.renderer.canvas.getBoundingClientRect();
  return { x: x + rect.left, y: y + rect.top, name: p.name };
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${outdir}/a1-army-selected.png` });
await page.mouse.click(info.x, info.y);
await page.waitForTimeout(700);
await page.screenshot({ path: `${outdir}/a2-odds.png` });
await page.getByRole('button', { name: 'Give battle' }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outdir}/a3-battle.png` });
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
await browser.close();
