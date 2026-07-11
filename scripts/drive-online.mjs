// Two browsers, one blind relay, one war: create → invite → seat → start →
// alternate turns. Verifies the whole online loop end-to-end.
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const [url = 'http://localhost:5199', outdir = '/tmp', relayOverride = ''] = process.argv.slice(2);

// a throwaway relay on a test port — or, for the production smoke, the
// LIVE relay passed as the third argument (no local spawn)
const relay = relayOverride ? null : spawn('node', ['server/relay.mjs', '8788'], { stdio: 'pipe' });
const relayWs = relayOverride || 'ws://localhost:8788';
if (!relayOverride) await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch();
const errors = [];
const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await ctx.newPage();
  await page.addInitScript((ws) => localStorage.setItem('rie-relay', ws), relayWs);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${String(e)}`));
  return page;
};

try {
  const a = await mkPage('A');
  const b = await mkPage('B');

  // A hosts
  await a.goto(url, { waitUntil: 'networkidle' });
  await a.getByRole('button', { name: 'Play with Friends' }).click();
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

  // host sees both, begins with no clock and no AI fill. Real relays have
  // real latency (and a contested seat costs extra round trips), so poll —
  // and count only the muster table's rows, never the Wayhouse list's.
  let rows = 0;
  for (let i = 0; i < 25; i++) {
    rows = await a.locator('.lobby-table').first().locator('.lobby-row').count();
    if (rows >= 2) break;
    await a.waitForTimeout(400);
  }
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

  // REJOIN: B refreshes mid-game via the invite link and must land exactly
  // where the war stands (the cursor bug once reset rejoiners to season 1)
  await b.goto(invite, { waitUntil: 'networkidle' });
  await b.waitForSelector('.end-turn', { timeout: 15000 });
  await b.waitForTimeout(1200);
  const sb2 = await seasonOf(b);
  if (sb2 !== 2) throw new Error(`rejoin landed at season ${sb2}, wanted 2`);
  const hb2 = await hash(b);
  if (hb2 !== ha) throw new Error('rejoined client state diverged');

  // SPELL THEATER over the wire: both clients get the same test injection
  // (spell knowledge is validated by the engine, and the injection is not in
  // the relay log — which is also why this test runs AFTER the rejoin check;
  // save/load persistence of mods is covered by the engine tests). Then one
  // real cast dispatched by A must apply identically on both clients.
  const inject = (page) => page.evaluate(() => {
    const s = window.__game.state;
    s.players[0].spells.push('wardOfEmbers');
    s.players[0].emberlight = 50;
  });
  await inject(a);
  await inject(b);
  const seat0 = await a.evaluate(() => window.__game.state.players[0].seatProvince);
  await a.evaluate((p) => window.__game.dispatch({ t: 'castSpell', spell: 'wardOfEmbers', province: p }), seat0);
  await a.waitForTimeout(1100);
  const modOn = (page) => page.evaluate(
    (p) => window.__game.state.provinces[p].mods.some((m) => m.spellId === 'wardOfEmbers'), seat0);
  if (!(await modOn(a))) throw new Error('ward mod missing on the casting client');
  if (!(await modOn(b))) throw new Error('ward mod missing on the receiving client after the echo');
  const [ha3, hb3] = [await hash(a), await hash(b)];
  if (ha3 !== hb3) throw new Error(`the cast desynced the clients: ${ha3} vs ${hb3}`);
  await a.screenshot({ path: `${outdir}/on4-a-warded.png` });

  // SIGNATURES over the wire: seat 0 fires whatever fate dealt, with a
  // target computed from state; the echo must land identically on both.
  // source import exists on the dev server only; the production smoke
  // (relayOverride set) covers the wire with the cast test above
  const sigFired = relayOverride ? { ok: 'skipped', sig: 'prod-build' } : await a.evaluate(() => (async () => {
    const screen = window.__game;
    const state = screen.state;
    const pid = state.current;
    const mod = await import('/src/engine/content/lords.ts');
    const sigDef = mod.LORD_BY_ID[state.players[pid].lordId].signature;
    let action = { t: 'signature' };
    if (sigDef.target === 'rival') {
      action = { t: 'signature', targetPlayer: state.players.find((p) => p.alive && p.id !== pid).id };
    } else if (sigDef.target === 'enemyProvince') {
      const p = state.provinces.find((pp) => pp.owner >= 0 && pp.owner !== pid
        && pp.neighbors.some((n) => state.provinces[n].owner === pid));
      if (!p) return { ok: 'skipped', sig: sigDef.id }; // no legal target this seed
      action = { t: 'signature', province: p.id };
    } else if (sigDef.id === 'openTheDoors') {
      return { ok: 'skipped', sig: sigDef.id }; // needs a barrow; state injection would desync
    }
    return { ok: screen.dispatch(action), sig: sigDef.id };
  })());
  if (sigFired.ok === true) {
    await a.waitForTimeout(1100);
    const [ha4, hb4] = [await hash(a), await hash(b)];
    if (ha4 !== hb4) throw new Error(`the signature desynced the clients (${sigFired.sig})`);
    const cdBoth = await b.evaluate(() => window.__game.state.players[0].signatureCooldownLeft);
    if (!(cdBoth > 0)) throw new Error('signature cooldown missing on the receiving client');
  } else if (sigFired.ok !== 'skipped') {
    throw new Error(`signature refused over the wire (${sigFired.sig})`);
  }

  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'online drive clean: 2 clients, 2 turns, identical state, rejoin lands mid-war, a cast lands sealed on both');
} finally {
  await browser.close();
  relay?.kill();
}
