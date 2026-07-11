// Trend table over a directory of sim-report.json files (e.g. nightly
// artifacts collected into one folder): one line per report, sorted by
// `when`, showing per-lord winrate (wins per seat) and endings share.
// No dependencies.
//
//   node scripts/trend.mjs <dir-of-reports>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/trend.mjs <dir with sim-report*.json files>');
  process.exit(2);
}

const reports = [];
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.json')) continue;
  const path = join(dir, name);
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(r.games)) continue; // not a sim report
    reports.push({ name, ...r });
  } catch {
    console.error(`skipping ${name}: not valid JSON`);
  }
}
if (reports.length === 0) {
  console.error(`no sim reports found in ${dir}`);
  process.exit(1);
}
reports.sort((a, b) => String(a.when).localeCompare(String(b.when)));

// stable column orders, taken from everything seen across all reports
const lords = [...new Set(reports.flatMap((r) => r.games.flatMap((g) => g.seatLords ?? [])))].sort();
const paths = [...new Set(reports.flatMap((r) => r.games.map((g) => g.path).filter(Boolean)))].sort();

function statsOf(report) {
  const seats = new Map();
  const wins = new Map();
  const endings = new Map();
  for (const g of report.games) {
    for (const lord of g.seatLords ?? []) seats.set(lord, (seats.get(lord) ?? 0) + 1);
    if (g.winnerLord) wins.set(g.winnerLord, (wins.get(g.winnerLord) ?? 0) + 1);
    if (g.path) endings.set(g.path, (endings.get(g.path) ?? 0) + 1);
  }
  return { seats, wins, endings, games: report.games.length };
}

const pct = (n, of) => (of === 0 ? '  — ' : `${Math.round((n / of) * 100)}%`.padStart(4));

// header: date, games, one column per lord (winrate/seat), one per ending
const short = (s) => s.slice(0, 6).padStart(6);
const head = ['when      ', 'games', ...lords.map(short), '|', ...paths.map(short)];
console.log(head.join(' '));
console.log('-'.repeat(head.join(' ').length));

for (const r of reports) {
  const { seats, wins, endings, games } = statsOf(r);
  const when = String(r.when ?? '?').slice(0, 10);
  const cells = [
    when.padEnd(10),
    String(games).padStart(5),
    ...lords.map((lord) => pct(wins.get(lord) ?? 0, seats.get(lord) ?? 0).padStart(6)),
    '|',
    ...paths.map((p) => pct(endings.get(p) ?? 0, games).padStart(6)),
  ];
  console.log(cells.join(' '));
}

console.log(`\n${reports.length} report(s). Lord columns: wins per seat. Ending columns: share of games.`);
