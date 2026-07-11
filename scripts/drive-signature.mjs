// Drive the signature: the seal button opens the ability card, a real
// dispatch fires whatever lord fate dealt (targets computed from state),
// the cooldown badge appears, and a second use is refused.
// node scripts/drive-signature.mjs <baseUrl> <outdir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(700);
await page.locator('#setup-seed').fill('drive-signature-1');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1400);
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(400);

// 1) the seal opens the ability card
await page.locator('.signature-btn').click();
await page.waitForTimeout(400);
const dialog = page.getByRole('dialog', { name: 'The Signature' });
if (!(await dialog.isVisible())) throw new Error('signature modal did not open from the seal');
await page.screenshot({ path: `${outdir}/signature-1-modal.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 2) a real dispatch, target computed from state for whatever lord this is
const fired = await page.evaluate(() => {
  const screen = window.__game;
  const state = screen.state;
  const pid = state.current;
  // resolve via the engine content on the page
  return (async () => {
    const mod = await import('/src/engine/content/lords.ts');
    const sigDef = mod.LORD_BY_ID[state.players[pid].lordId].signature;
    let action = { t: 'signature' };
    if (sigDef.target === 'rival') {
      const rival = state.players.find((p) => p.alive && p.id !== pid);
      action = { t: 'signature', targetPlayer: rival.id };
    } else if (sigDef.target === 'enemyProvince') {
      const p = state.provinces.find((pp) => pp.owner >= 0 && pp.owner !== pid
        && pp.neighbors.some((n) => state.provinces[n].owner === pid));
      if (!p) return { ok: false, error: 'no bordering rival province on this seed' };
      action = { t: 'signature', province: p.id };
    } else if (sigDef.id === 'openTheDoors') {
      // morrikan needs a barrow; grant one for the drive
      const mine = state.provinces.find((pp) => pp.owner === pid);
      mine.site = 'barrow';
    }
    const ok = screen.dispatch(action);
    return { ok, sig: sigDef.id, cd: state.players[pid].signatureCooldownLeft };
  })();
});
if (!fired.ok) throw new Error(`signature dispatch failed: ${fired.error ?? 'refused'} (${fired.sig ?? ''})`);
if (!(fired.cd > 0)) throw new Error('cooldown did not start');
await page.waitForTimeout(600);
await page.screenshot({ path: `${outdir}/signature-2-fired.png` });

// 3) the badge shows the cooldown and a second use is refused
const badge = await page.locator('.signature-btn .badge-quiet').textContent().catch(() => null);
if (!badge) throw new Error('cooldown badge missing on the seal');
const second = await page.evaluate(() => window.__game.dispatch({ t: 'signature' }));
if (second) throw new Error('second use was not refused during cooldown');

await browser.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`signature drive: seal card opens, ${fired.sig} fires with a real target, cooldown ${fired.cd} shows and guards`);
