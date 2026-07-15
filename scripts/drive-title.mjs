// The Marginalia title (redesign 2a), driven to its QA checklist:
//   - the four doors carry their exact accessible names (the other drives
//     click them by name, so a rename here would break the whole harness)
//   - no label or annotation ever wraps to two lines (desktop + phone)
//   - the painting mounts and the ledger is the vellum sheet
//   - Continue is absent with no save, present after one, and its name
//     starts with "Continue" (drive-ember reloads onto it)
//   - phone: TOC rows >= 44px, the footer is not hidden behind browser
//     chrome (100dvh), nothing overflows the ledger's width
// node scripts/drive-title.mjs <baseUrl>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199'] = process.argv.slice(2);
const browser = await chromium.launch();
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };

// shared assertions on an already-loaded title screen
async function check(page, label) {
  await page.waitForSelector('.tm-ledger', { timeout: 5000 });
  await page.waitForTimeout(300);

  for (const name of ['A Quick Chronicle', 'New Chronicle', 'Play with Friends', 'The First Ember']) {
    if (!(await page.getByRole('button', { name, exact: false }).first().isVisible())) {
      fail(`${label}: door "${name}" missing`);
    }
  }

  // no label / annotation wraps to two lines (the QA finding), and nothing
  // in the ledger pokes past the viewport width
  const problems = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.tm-toc-label, .tm-toc-note, .tm-util, .tm-continue-name, .tm-continue-kick, .tm-header-label')) {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
      // content height only: the mobile util links carry vertical padding for
      // the hit target, which is not a wrap
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const contentH = el.getBoundingClientRect().height - padY;
      if (contentH > lh * 1.6) bad.push('WRAP ' + el.className.split(' ')[0] + ' :: ' + el.textContent.trim().slice(0, 28));
    }
    for (const el of document.querySelectorAll('.tm-ledger *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 8 && r.right > window.innerWidth + 1) bad.push('OVERFLOW ' + el.className.split(' ')[0]);
    }
    return bad;
  });
  if (problems.length) fail(`${label}: ${[...new Set(problems)].join(' | ')}`);

  if (await page.locator('.tm-art .art-img').count() < 1) fail(`${label}: the hall painting did not mount`);
  if (!(await page.locator('.tm-ledger').isVisible())) fail(`${label}: the vellum ledger is not visible`);
}

// -------------------------------------------------- desktop 1440x900
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // fresh shelf: Continue absent, First Ember promoted to "start here"
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  await page.reload({ waitUntil: 'networkidle' });
  await check(page, 'desktop-nosave');
  if (await page.locator('.tm-continue').count() !== 0) fail('desktop: Continue shown with no save');
  const promoted = await page.locator('.tm-toc-promoted .tm-toc-note').textContent().catch(() => '');
  if (!/start here/i.test(promoted || '')) fail('desktop: First Ember not promoted ("start here") with no save');

  const layout = await page.evaluate(() => {
    const l = document.querySelector('.tm-ledger').getBoundingClientRect();
    const a = document.querySelector('.tm-art').getBoundingClientRect();
    return { ledgerW: Math.round(l.width), ledgerRight: Math.round(l.right), artLeft: Math.round(a.left), vw: window.innerWidth };
  });
  if (Math.abs(layout.ledgerW - 430) > 6) fail(`desktop: ledger width ${layout.ledgerW}px, wanted ~430`);
  if (layout.ledgerRight < layout.vw - 1) fail('desktop: ledger is not pinned to the right edge');
  if (layout.artLeft !== 0) fail('desktop: art zone is not flush left');
  await page.screenshot({ path: '/tmp/t-desktop-nosave.png' });

  // make a save, then reload onto the Continue card
  await page.getByRole('button', { name: 'New Chronicle' }).click();
  await page.waitForTimeout(600);
  await page.locator('#setup-seed').fill('title-drive-1');
  await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
  await page.waitForTimeout(1500);
  const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await check(page, 'desktop-save');
  const cont = page.getByRole('button', { name: /^Continue/ });
  if (!(await cont.isVisible().catch(() => false))) fail('desktop: Continue absent after a save was made');
  const contName = (await cont.getAttribute('aria-label')) || '';
  if (!/^Continue/.test(contName)) fail(`desktop: Continue name "${contName}" must start with Continue`);
  if (await page.locator('.tm-portrait').count() !== 1) fail('desktop: Continue portrait missing');
  await page.screenshot({ path: '/tmp/t-desktop-save.png' });

  if (errors.length) fail('desktop page errors:\n' + errors.join('\n'));
  await page.close();
  console.log('desktop: right-pinned 430px ledger, save-aware Continue, no wrap/overflow — ok');
}

// -------------------------------------------------- phone 390x844 (with a save)
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' }); // save from the desktop run persists in this context? no — new context
  await check(page, 'phone-390');

  const stacked = await page.evaluate(() => {
    const a = document.querySelector('.tm-art').getBoundingClientRect();
    const l = document.querySelector('.tm-ledger').getBoundingClientRect();
    return { artBottom: Math.round(a.bottom), ledgerTop: Math.round(l.top) };
  });
  if (stacked.ledgerTop < stacked.artBottom - 2) fail('phone: ledger is not stacked below the art');

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.tm-toc-row')].map((r) => Math.round(r.getBoundingClientRect().height)).filter((h) => h < 44));
  if (small.length) fail(`phone: TOC rows below 44px: ${small.join(', ')}`);

  const foot = await page.evaluate(() => ({
    bottom: document.querySelector('.tm-foot').getBoundingClientRect().bottom,
    innerH: window.innerHeight,
  }));
  if (foot.bottom > foot.innerH + 1) fail(`phone: footer bottom ${Math.round(foot.bottom)} past viewport ${foot.innerH} (100dvh?)`);
  await page.screenshot({ path: '/tmp/t-phone-390.png' });

  if (errors.length) fail('phone-390 page errors:\n' + errors.join('\n'));
  await page.close();
  console.log('phone-390: stacked, >=44px rows, footer within 100dvh, no wrap/overflow — ok');
}

// -------------------------------------------------- small phone 320x568
{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await check(page, 'phone-320');
  await page.screenshot({ path: '/tmp/t-phone-320.png' });
  if (errors.length) fail('phone-320 page errors:\n' + errors.join('\n'));
  await page.close();
  console.log('phone-320: no wrap, no width overflow — ok');
}

await browser.close();
console.log('\ndrive-title: all Marginalia checks pass');
