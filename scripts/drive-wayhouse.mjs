// The stranger path: host A posts an open table in the Wayhouse; stranger B —
// holding NO invite link — finds it on the Online screen and sits down at
// A's table. Proves docs/design/open-tables.md end-to-end on a local relay.
//   node scripts/drive-wayhouse.mjs [baseUrl] [outdir]
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const [url = 'http://localhost:5199', outdir = '/tmp'] = process.argv.slice(2);
const relay = spawn('node', ['server/relay.mjs', '8789'], { stdio: 'pipe' });
const relayWs = 'ws://localhost:8789';
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch();
const errors = [];
const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript((ws) => localStorage.setItem('rie-relay', ws), relayWs);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${String(e)}`));
  return page;
};

try {
  // A hosts, seats, and posts the table
  const a = await mkPage('A');
  await a.goto(url, { waitUntil: 'networkidle' });
  await a.getByRole('button', { name: 'Play with Friends' }).click();
  await a.waitForSelector('.lobby-invite input');
  await a.fill('input[placeholder="Your name at the table"]', 'Alaric');
  await a.getByRole('button', { name: 'Take a seat' }).click();
  await a.waitForTimeout(500);
  const inviteA = await a.inputValue('.lobby-invite input');
  await a.locator('label:has-text("Post in the Wayhouse") input').check();
  await a.waitForTimeout(700);
  await a.screenshot({ path: `${outdir}/wayhouse-a-posted.png` });

  // the invite key must be OUT of A's address bar (round-2 scrub)
  const aUrl = a.url();
  if (aUrl.includes('#war=')) throw new Error(`invite key still in the address bar: ${aUrl}`);

  // B arrives with nothing: no invite, a different (own) room
  const b = await mkPage('B');
  await b.goto(url, { waitUntil: 'networkidle' });
  await b.getByRole('button', { name: 'Play with Friends' }).click();
  await b.waitForSelector('.lobby-invite input');
  const inviteB = await b.inputValue('.lobby-invite input');
  if (inviteB === inviteA) throw new Error('B unexpectedly landed in A’s room before the Wayhouse');

  // ...and finds Alaric's table in the Wayhouse
  await b.waitForSelector('text=Alaric’s table', { timeout: 8000 });
  await b.screenshot({ path: `${outdir}/wayhouse-b-sees-table.png` });
  await b.getByRole('button', { name: 'Sit down' }).first().click();
  await b.waitForSelector('.lobby-invite input');
  await b.waitForTimeout(700);
  const inviteB2 = await b.inputValue('.lobby-invite input');
  if (inviteB2 !== inviteA) throw new Error('B sat down but did not land at A’s table');
  await b.fill('input[placeholder="Your name at the table"]', 'Berta');
  await b.getByRole('button', { name: 'Take a seat' }).click();
  await b.waitForTimeout(700);

  // A sees the stranger seated
  const aTable = await a.locator('.lobby-table').first().innerText();
  if (!aTable.includes('Berta')) throw new Error(`A does not see the stranger at the table: ${aTable}`);
  await a.screenshot({ path: `${outdir}/wayhouse-a-with-stranger.png` });

  // A begins the war; both clients land in the same game
  await a.getByRole('button', { name: 'Begin the war' }).click();
  await a.waitForTimeout(2500);
  await a.screenshot({ path: `${outdir}/wayhouse-a-after-begin.png` });
  // A (seat 0) sees the End button; B is watching A's season — both must
  // simply BE at the war table with the same forged realm
  await a.waitForSelector('text=End the Season', { timeout: 15000 });
  await b.waitForSelector('.topbar', { timeout: 15000 });
  await b.waitForFunction(() => Boolean(window.__game?.state), null, { timeout: 15000 });
  const [stateA, stateB] = await Promise.all([
    a.evaluate(() => JSON.stringify(window.__game.state.rng)),
    b.evaluate(() => JSON.stringify(window.__game.state.rng)),
  ]);
  if (stateA !== stateB) throw new Error('stranger war started but states diverge');

  if (errors.length) throw new Error('console errors:\n' + errors.join('\n'));
  console.log('wayhouse drive clean: table posted (key scrubbed from the bar), stranger found it, sat down, war started identically for both');
} finally {
  await browser.close();
  relay.kill();
}
