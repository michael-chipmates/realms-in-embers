// Screenshot helper: node shot.mjs <url> <outfile> [w] [h] [waitMs] [script]
import { chromium } from 'playwright';

const [url, out, w = '1440', h = '900', waitMs = '1800', script = ''] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto(url, { waitUntil: 'networkidle' });
if (script) {
  await page.evaluate(script);
}
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
if (errors.length) {
  console.log('CONSOLE ERRORS:');
  for (const e of errors) console.log('  ' + e.slice(0, 500));
} else {
  console.log('no console errors');
}
await browser.close();
