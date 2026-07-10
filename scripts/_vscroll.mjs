import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5199';
const browser = await chromium.launch();
const page = await (await browser.newContext({
  viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
})).newPage();

// Report: any element whose bottom edge is below the viewport AND has no scrollable ancestor
const audit = (label) => page.evaluate((lbl) => {
  const H = innerHeight;
  const canScroll = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if ((/(auto|scroll)/.test(s.overflowY)) && n.scrollHeight > n.clientHeight + 2) return true;
    }
    const de = document.scrollingElement;
    return de && de.scrollHeight > de.clientHeight + 2 && !/hidden/.test(getComputedStyle(document.body).overflowY);
  };
  const cut = [];
  for (const el of document.querySelectorAll('button, input, select, a, [role="dialog"] p, h1, h2')) {
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) continue;
    if (r.bottom > H + 4 && !canScroll(el)) {
      cut.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]} "${(el.textContent||'').trim().slice(0,40)}" bottom=${Math.round(r.bottom)}`);
    }
  }
  return { lbl, H, cut: [...new Set(cut)].slice(0, 12) };
}, label);

const show = (r) => console.log(`\n[${r.lbl}] viewport h=${r.H}${r.cut.length ? '\n  CUT+UNREACHABLE:\n  ' + r.cut.join('\n  ') : '  ✓ all reachable'}`);

await page.goto(URL, { waitUntil: 'networkidle' });
show(await audit('title'));
await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(800);
show(await audit('setup'));
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1800);
show(await audit('onboarding-p1'));
const goOn = page.getByRole('button', { name: 'Go on' });
for (let i = 2; i <= 4 && await goOn.isVisible().catch(() => false); i++) {
  await goOn.click(); await page.waitForTimeout(400);
  show(await audit(`onboarding-p${i}`));
}
const take = page.getByRole('button', { name: 'Take the realm' });
if (await take.isVisible().catch(() => false)) await take.click();
await page.waitForTimeout(700);
show(await audit('game'));
await page.keyboard.press('d'); await page.waitForTimeout(500);
show(await audit('diplomacy'));
await page.keyboard.press('Escape');
await page.keyboard.press('l'); await page.waitForTimeout(500);
show(await audit('ledger'));
await page.keyboard.press('Escape');
await page.keyboard.press('h'); await page.waitForTimeout(500);
show(await audit('court'));
await browser.close();
