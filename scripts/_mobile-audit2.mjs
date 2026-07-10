import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const [w, mob] of [[320, true], [360, true], [390, true], [414, true], [568, false], [700, false]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: mob, hasTouch: mob })).newPage();
  const audit = async (label) => {
    const r = await page.evaluate(() => {
      const iw = window.innerWidth;
      const offenders = [];
      for (const el of document.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (rect.right > iw + 1) offenders.push({ t: el.tagName, c: String(el.className).slice(0, 50), r: Math.round(rect.right), w: Math.round(rect.width) });
      }
      offenders.sort((a, b) => b.r - a.r);
      return { iw, docW: document.documentElement.scrollWidth, off: offenders.slice(0, 4) };
    });
    if (r.docW > r.iw) console.log(`OVERFLOW @${w} ${label}: ${r.docW}/${r.iw} :: ${r.off.map(o => `${o.t}.${o.c}(w${o.w})`).join(' | ')}`);
  };
  await page.goto('http://localhost:5199', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New Chronicle' }).click();
  await page.waitForTimeout(500);
  await page.locator('#setup-seed').fill('drive-attack-3');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
  await page.waitForTimeout(1600);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(500);
  await audit('game');
  // attack odds modal
  const info = await page.evaluate(() => {
    const g = window.__game;
    const army = Object.values(g.state.armies).find((a) => a.owner === g.state.current);
    g.selectArmy(army.id);
    const t = g.targets.find((t2) => t2.hostile);
    if (!t) return null;
    const p = g.state.provinces[t.to];
    const [x, y] = g.renderer.worldToScreen(p.cx + 0.5, p.cy + 0.5);
    const rect = g.renderer.canvas.getBoundingClientRect();
    return { x: x + rect.left, y: y + rect.top };
  });
  if (info) {
    await page.mouse.click(info.x, info.y).catch(() => {});
    await page.waitForTimeout(1000);
    await audit('odds-modal');
    const give = page.getByRole('button', { name: /Give battle/ });
    if (await give.isVisible().catch(() => false)) {
      await give.click();
      await page.waitForTimeout(1500);
      await audit('battle-report');
      const close = page.getByRole('button', { name: 'Close the account' });
      if (await close.isVisible().catch(() => false)) await close.click();
    }
  }
  // game end + saga
  await page.evaluate(() => { window.__game.state.victory.maxTurns = 2; });
  for (let i = 0; i < 4; i++) {
    const over = await page.evaluate(() => window.__game.state.phase === 'ended');
    if (over) break;
    const choice = page.locator('.event-choice').first();
    if (await choice.isVisible().catch(() => false)) await choice.click();
    const btn = page.getByRole('button', { name: 'End the Season' });
    if (await btn.isEnabled().catch(() => false)) { await btn.click(); await page.waitForTimeout(2200); }
    else await page.waitForTimeout(800);
  }
  await page.waitForTimeout(800);
  await audit('game-end');
  const sagaBtn = page.getByRole('button', { name: 'Read the finished Saga' });
  if (await sagaBtn.isVisible().catch(() => false)) {
    await sagaBtn.click();
    await page.waitForTimeout(600);
    await audit('saga-reader');
  }
  if (w === 390) await page.screenshot({ path: '/private/tmp/claude-501/-Users-mitsch-Documents-Coding-realms-in-embers/b40b946c-c8e0-4dde-b9fc-fdef5cef747f/scratchpad/mob-end.png' });
  await page.context().close();
}
console.log('audit complete');
await browser.close();
