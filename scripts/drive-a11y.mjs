// The axe sweep: title, setup, the war table, and the big overlays, scanned
// with axe-core. Serious and critical violations fail the gate — the same
// bar every release must clear, in CI and before a deploy.
// node scripts/drive-a11y.mjs <baseUrl>
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const [url = 'http://localhost:5199'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];

async function scan(label) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () =>
    // the vellum map is a canvas with its own accessible twin (the
    // Navigator); axe cannot see that relationship, so the canvas node
    // itself is exempt. The tooltip is a transient popover (role=tooltip,
    // aria-describedby) that never holds standalone page content.
    // Nothing else is excluded.
    await window.axe.run(
      { exclude: [['canvas'], ['#rie-tooltip']] },
      { resultTypes: ['violations'] },
    ));
  const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of serious) {
    failures.push(`${label}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target?.join(' ')})`);
  }
  console.log(`${label}: ${serious.length} serious/critical, ${result.violations.length - serious.length} minor`);
}

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await scan('title');

await page.getByRole('button', { name: 'New Chronicle' }).click();
await page.waitForTimeout(800);
await scan('setup');

await page.locator('#setup-seed').fill('a11y-sweep-1');
await page.getByRole('button', { name: 'Begin the Chronicle' }).click();
await page.waitForTimeout(1600);
const skip = page.getByRole('button', { name: 'I have read the Chronicle before' });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(400);
await scan('war table');

for (const [key, label] of [['l', 'ledger'], ['p', 'navigator'], ['b', 'brief'], ['c', 'codex'], ['?', 'keys']]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
  await scan(label);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

await browser.close();
if (failures.length > 0) {
  console.error('\nAXE GATE FAILED:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('axe gate clean: no serious or critical violations');
