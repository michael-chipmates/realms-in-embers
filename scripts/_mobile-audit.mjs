import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const audit = async (label) => {
  const r = await page.evaluate(() => {
    const iw = window.innerWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.right > iw + 1 || rect.left < -1) {
        offenders.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), right: Math.round(rect.right), left: Math.round(rect.left), w: Math.round(rect.width) });
      }
    }
    offenders.sort((a, b) => b.right - a.right);
    return { iw, docW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, offenders: offenders.slice(0, 5) };
  });
  const over = r.docW > r.iw;
  console.log(`${over ? 'OVERFLOW' : 'ok      '} ${label}: doc ${r.docW}/${r.iw}${over ? ' :: ' + r.offenders.map(o => `${o.tag}.${o.cls}(w${o.w},r${o.right})`).join(' | ') : ''}`);
};

await page.goto('http://localhost:5199', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await audit('title');
await page.getByRole('button', { name: 'Online War' }).click();
await page.waitForTimeout(1200);
await audit('lobby');
await page.goBack().catch(() => {});
await page.goto('http://localhost:5199', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(800);
await audit('setup');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(2000);
await audit('onboarding');
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(800);
await audit('game');
for (const [key, name] of [['h', 'court'], ['m', 'magic'], ['q', 'quests'], ['d', 'diplomacy'], ['l', 'ledger']]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(900);
  await audit(name);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
// selection sheet
await page.evaluate(() => {
  const g = window.__game;
  const army = Object.values(g.state.armies).find((a) => a.owner === g.state.current);
  g.selectArmy(army.id);
});
await page.waitForTimeout(800);
await audit('selection-sheet');
await page.screenshot({ path: '/private/tmp/claude-501/-Users-mitsch-Documents-Coding-realms-in-embers/b40b946c-c8e0-4dde-b9fc-fdef5cef747f/scratchpad/mob-game.png' });
await browser.close();
