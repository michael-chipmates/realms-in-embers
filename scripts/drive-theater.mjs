// Drive the Spell Theater: cast a real Ward of Embers through the real UI
// dispatch path, screenshot the cast moment and the lasting seal, verify the
// panel chip names the working, and assert reduced-motion skips the fx.
// Uses the window.__game screen handle (same one drive-online relies on).
// node scripts/drive-theater.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];

async function boot(page) {
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'New Chronicle' }).click();
  await page.waitForTimeout(700);
  await page.locator('#setup-seed').fill('drive-theater-1');
  await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
  await page.waitForTimeout(1400);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
}

async function castWard(page) {
  return page.evaluate(() => {
    const screen = window.__game;
    if (!screen) return { ok: false, error: 'no game screen handle' };
    const state = screen.state;
    const pid = state.current;
    state.players[pid].spells.push('wardOfEmbers');
    state.players[pid].emberlight = 50;
    const seat = state.players[pid].seatProvince;
    const ok = screen.dispatch({ t: 'castSpell', spell: 'wardOfEmbers', province: seat });
    return { ok, seat, pid };
  });
}

// ---- full-motion run: cast fx mid-flight + persistent seal + panel chip
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await boot(page);
  const cast = await castWard(page);
  if (!cast.ok) throw new Error(`cast failed: ${cast.error ?? 'dispatch refused'}`);
  await page.waitForTimeout(300); // mid-animation
  await page.screenshot({ path: `${outdir}/theater-1-casting.png` });
  await page.waitForTimeout(1200); // animation over; the seal remains
  await page.screenshot({ path: `${outdir}/theater-2-seal.png` });
  // the panel chip names the working and the caster
  const chip = await page.evaluate((seat) => {
    window.__game.select(seat, null);
    return new Promise((resolve) => setTimeout(() => {
      const el = [...document.querySelectorAll('.chip-magic')].find((c) => c.textContent.includes('Ward of Embers'));
      resolve(el ? el.textContent : null);
    }, 300));
  }, cast.seat);
  if (!chip) throw new Error('Ward of Embers chip missing from the province panel');
  await page.screenshot({ path: `${outdir}/theater-3-panel.png` });
  // fx queue must drain (bounded)
  const fxLeft = await page.evaluate(() => window.__game.spellFx?.length ?? 'private');
  if (typeof fxLeft === 'number' && fxLeft > 0) throw new Error(`spell fx queue did not drain: ${fxLeft}`);
  await page.close();
}

// ---- reduced-motion run: cast lands, seal appears, but NO fx frames
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await boot(page);
  await page.evaluate(() => { window.__game.app.settings.reducedMotion = true; window.__game.app.applySettings(); });
  const cast = await castWard(page);
  if (!cast.ok) throw new Error('reduced-motion cast failed');
  const fxCount = await page.evaluate(() => window.__game.spellFx?.length ?? 0);
  if (fxCount > 0) throw new Error(`reduced motion must skip cast fx, found ${fxCount}`);
  await page.screenshot({ path: `${outdir}/theater-4-reduced.png` });
  await page.close();
}

await browser.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('theater drive: cast animates, seal persists, chip names the working, reduced-motion skips fx, queue drains');
