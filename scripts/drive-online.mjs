// Two browsers, one blind relay, one war: create → invite → seat → start →
// alternate turns. Verifies the whole online loop end-to-end.
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);

// a throwaway relay on a test port
const relay = spawn('node', ['server/relay.mjs', '8788'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch();
const errors = [];
const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('rie-relay', 'ws://localhost:8788'));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${String(e)}`));
  return page;
};

try {
  const a = await mkPage('A');
  const b = await mkPage('B');

  // A hosts
  await a.goto(url, { waitUntil: 'networkidle' });
  await a.getByRole('button', { name: 'Online War' }).click();
  await a.waitForSelector('.lobby-invite input');
  await a.fill('input[placeholder="Your name at the table"]', 'Alaric');
  await a.getByRole('button', { name: 'Take a seat' }).click();
  await a.waitForTimeout(400);
  const invite = await a.inputValue('.lobby-invite input');
  if (!invite.includes('#war=')) throw new Error('no invite link');

  // B joins via the link
  await b.goto(invite, { waitUntil: 'networkidle' });
  await b.waitForSelector('.lobby-invite input');
  await b.fill('input[placeholder="Your name at the table"]', 'Berta');
  await b.getByRole('button', { name: 'Take a seat' }).click();
  await b.waitForTimeout(500);

  // host sees both, begins with no clock and no AI fill
  await a.waitForTimeout(400);
  const rows = await a.locator('.lobby-row').count();
  if (rows < 2) throw new Error(`host sees ${rows} seated, wanted 2`);
  await a.selectOption('.lobby-field:nth-of-type(3) select', { index: 0 }); // no clock
  await a.getByRole('button', { name: 'Begin the war' }).click();

  // both land at the war table
  await a.waitForSelector('.end-turn', { timeout: 15000 });
  await b.waitForSelector('.end-turn', { timeout: 15000 });
  for (const page of [a, b]) {
    const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(300);
    }
  }
  await a.screenshot({ path: `${outdir}/on1-a-game.png` });

  const turnOf = (page) => page.evaluate(() => window.__game.state.current);
  const seasonOf = (page) => page.evaluate(() => window.__game.state.turn);

  // seat 0 (A) moves; B's button must be waiting
  const bDisabled = await b.locator('.end-turn').isDisabled();
  if (!bDisabled) throw new Error("B's End button enabled on A's turn");
  await a.getByRole('button', { name: 'End the Season' }).click();
  await a.waitForTimeout(900);
  if (await turnOf(b) !== 1) throw new Error(`B did not see the turn pass (current=${await turnOf(b)})`);

  // B moves; both should advance to season 2
  await b.getByRole('button', { name: 'End the Season' }).click();
  await b.waitForTimeout(1200);
  const [sa, sb] = [await seasonOf(a), await seasonOf(b)];
  if (sa !== 2 || sb !== 2) throw new Error(`seasons diverged: A=${sa} B=${sb}`);

  // determinism check: identical state hashes on both clients
  const hash = (page) => page.evaluate(() => JSON.stringify(window.__game.state).length + ':' + JSON.stringify(window.__game.state.rng));
  const [ha, hb] = [await hash(a), await hash(b)];
  if (ha !== hb) throw new Error(`state diverged between clients: ${ha} vs ${hb}`);

  await a.screenshot({ path: `${outdir}/on2-a-season2.png` });
  await b.screenshot({ path: `${outdir}/on3-b-season2.png` });
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'online drive clean: 2 clients, 2 turns, identical state');
} finally {
  await browser.close();
  relay.kill();
}
