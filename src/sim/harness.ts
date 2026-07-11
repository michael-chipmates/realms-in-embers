/**
 * The proving ground: plays full AI-vs-AI games headless and checks that
 * nothing crashes, every game terminates, victory paths actually occur,
 * invariants hold every round, and no lord or creed dominates unfairly.
 *
 *   npm run sim              # standard sweep (60 games)
 *   npm run sim -- --games 200
 *   npm run sim -- --seed-prefix nightly
 */
import { aiTakeTurn } from '../engine/ai';
import { createGame, serializeGame, deserializeGame, replayGame } from '../engine/engine';
import { LORD_BY_ID } from '../engine/content/lords';
import { defaultSettings, RULES_VERSION } from '../engine/state';
import { checkInvariants } from './invariants';
import type { Difficulty, GameSettings, GameState, MapSize } from '../engine/types';
import { writeFileSync } from 'node:fs';

interface GameRecord {
  seed: string;
  players: number;
  size: MapSize;
  rounds: number;
  winner: string | null;
  winnerLord: string | null;
  winnerDifficulty: string | null;
  seatDifficulties: string[];
  seatLords: string[];
  path: string | null;
  battles: number;
  rebellions: number;
  eliminations: number;
  chronicleEntries: number;
  /** Signature uses by lord id — the balance gate wants all twelve alive. */
  signatureUses: Record<string, number>;
  wallMs: number;
}

const args = process.argv.slice(2);
function argOf(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const GAMES = parseInt(argOf('games', '60'), 10);
const SEED_PREFIX = argOf('seed-prefix', 'sim');
const REPLAY_EVERY = parseInt(argOf('replay-every', '10'), 10);
/** --mirror: the confound-free balance referee (review night, 2026-07-11).
 * Every seat plays knight, lords deal round-robin in consecutive blocks so
 * each gets equal seats at every table size, and statistical gates judge
 * the result: per-lord two-sided test vs the seat-weighted baseline,
 * ending-share bands, and a signature-use floor. The old mixed sweep hid a
 * 44%-Corvas / 4%-Maera spread inside difficulty noise. */
const MIRROR = args.includes('--mirror');

const SIZES: MapSize[] = ['small', 'medium', 'large'];
const DIFFS: Difficulty[] = ['squire', 'knight', 'warlord'];
const LORD_IDS = Object.keys(LORD_BY_ID);

function settingsFor(i: number): GameSettings {
  const s = defaultSettings();
  s.seed = `${SEED_PREFIX}-${i}`;
  const playerCount = 2 + (i % 5); // 2..6
  // MIRROR fixes every condition but the lords: fog and size once cycled
  // with the game index and therefore with the lord rotation — a confound
  // the round-2 audit caught (per-lord fog exposure ranged 15-35%)
  s.mapSize = MIRROR ? 'medium' : SIZES[i % 3];
  if (playerCount > 4 && s.mapSize === 'small') s.mapSize = 'medium';
  s.players = Array.from({ length: playerCount }, (_, p) => ({
    kind: 'ai' as const,
    lordId: MIRROR ? LORD_IDS[(i * 5 + p) % LORD_IDS.length] : 'random',
    difficulty: MIRROR ? 'knight' : DIFFS[(i + p) % 3],
  }));
  s.maxTurns = 60;
  s.fogOfWar = MIRROR ? false : i % 4 === 0;
  return s;
}

// ------------------------------------------------------------------- run

function playGame(i: number): GameRecord {
  const settings = settingsFor(i);
  const started = performance.now();
  const { state } = createGame(settings);
  const maxSteps = (settings.maxTurns + 4) * settings.players.length + 40;
  let steps = 0;
  let battles = 0;
  let rebellions = 0;
  const signatureUses: Record<string, number> = {};
  let lastTurnSeen = state.turn;
  let stuckCounter = 0;

  while (state.phase === 'playing') {
    if (++steps > maxSteps) {
      throw new Error(`[${settings.seed}] game did not terminate (${steps} player-turns, turn ${state.turn})`);
    }
    const effects = aiTakeTurn(state);
    for (const e of effects) {
      if (e.e === 'battle') battles++;
      if (e.e === 'rebellion') rebellions++;
      if (e.e === 'signature') {
        const lord = state.players[e.by].lordId;
        signatureUses[lord] = (signatureUses[lord] ?? 0) + 1;
      }
    }
    if (state.turn !== lastTurnSeen) {
      lastTurnSeen = state.turn;
      stuckCounter = 0;
      checkInvariants(state, settings.seed);
    } else if (++stuckCounter > settings.players.length + 2) {
      throw new Error(`[${settings.seed}] round counter stuck at ${state.turn}`);
    }
  }
  checkInvariants(state, settings.seed);
  if (state.victory.winner === null) throw new Error(`[${settings.seed}] ended without a winner`);

  // save/load spot check
  const reloaded = deserializeGame(serializeGame(state));
  if (JSON.stringify(reloaded) !== JSON.stringify(state)) {
    throw new Error(`[${settings.seed}] save/load round-trip mismatch`);
  }
  // full replay determinism spot check (expensive: every Nth game)
  if (i % REPLAY_EVERY === 0) {
    const replayed = replayGame(state.settings, state.log);
    if (JSON.stringify(replayed) !== JSON.stringify(state)) {
      throw new Error(`[${settings.seed}] replay mismatch`);
    }
  }

  const winner = state.victory.winner;
  const eliminations = state.players.filter((p) => !p.alive).length;
  return {
    seed: settings.seed,
    players: settings.players.length,
    size: settings.mapSize,
    rounds: state.turn,
    winner: winner !== null ? `P${winner}` : null,
    winnerLord: winner !== null ? state.players[winner].lordId : null,
    winnerDifficulty: winner !== null ? (state.players[winner].difficulty ?? 'knight') : null,
    seatDifficulties: settings.players.map((p) => p.difficulty),
    seatLords: state.players.map((p) => p.lordId),
    path: state.victory.winPath,
    battles,
    rebellions,
    eliminations,
    chronicleEntries: state.chronicle.length,
    signatureUses,
    wallMs: Math.round(performance.now() - started),
  };
}

function pct(n: number, of: number): string {
  return of === 0 ? '—' : `${Math.round((n / of) * 100)}%`;
}

function main(): void {
  console.log(`Realms in Embers — simulation sweep: ${GAMES} games\n`);
  const records: GameRecord[] = [];
  const failures: string[] = [];
  const t0 = performance.now();
  for (let i = 0; i < GAMES; i++) {
    try {
      const rec = playGame(i);
      records.push(rec);
      const marker = rec.path === 'conquest' ? '⚔' : rec.path === 'dominion' ? '♛' : rec.path === 'goldenAge' ? '⛁' : rec.path === 'legend' ? '★' : '✎';
      process.stdout.write(
        `  ${String(i).padStart(3)}  ${rec.seed.padEnd(14)} ${String(rec.players)}p ${rec.size.padEnd(6)} ` +
        `${String(rec.rounds).padStart(2)} rounds  ${marker} ${String(rec.path).padEnd(9)} ${(rec.winnerLord ?? '—').padEnd(10)} ` +
        `${String(rec.battles).padStart(3)} battles  ${String(rec.wallMs).padStart(5)}ms\n`,
      );
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
      process.stdout.write(`  ${String(i).padStart(3)}  FAILED: ${failures[failures.length - 1]}\n`);
    }
  }
  const wallTotal = performance.now() - t0;

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`Games: ${records.length}/${GAMES} completed in ${(wallTotal / 1000).toFixed(1)}s`);
  if (records.length > 0) {
    const rounds = records.map((r) => r.rounds).sort((a, b) => a - b);
    console.log(`Rounds: min ${rounds[0]}, median ${rounds[Math.floor(rounds.length / 2)]}, max ${rounds[rounds.length - 1]}`);
    const byPath = new Map<string, number>();
    for (const r of records) byPath.set(String(r.path), (byPath.get(String(r.path)) ?? 0) + 1);
    console.log('Victory paths:');
    for (const [path, n] of [...byPath.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${path.padEnd(10)} ${String(n).padStart(3)}  ${pct(n, records.length)}`);
    }
    const byLordWins = new Map<string, number>();
    const byLordGames = new Map<string, number>();
    for (const r of records) {
      if (r.winnerLord) byLordWins.set(r.winnerLord, (byLordWins.get(r.winnerLord) ?? 0) + 1);
      for (const lord of r.seatLords) byLordGames.set(lord, (byLordGames.get(lord) ?? 0) + 1);
    }
    console.log('Wins by lord (wins / seats at the table):');
    const lords = [...byLordGames.entries()].sort((a, b) => (byLordWins.get(b[0]) ?? 0) - (byLordWins.get(a[0]) ?? 0));
    for (const [lord, games] of lords) {
      const wins = byLordWins.get(lord) ?? 0;
      console.log(`  ${(LORD_BY_ID[lord]?.name ?? lord).padEnd(24)} ${String(wins).padStart(3)} / ${String(games).padStart(3)}  ${pct(wins, games)}`);
    }
    // difficulty fairness: wins per seat at each handicap tier
    const diffSeats = new Map<string, number>();
    const diffWins = new Map<string, number>();
    for (const r of records) {
      for (const d of r.seatDifficulties) diffSeats.set(d, (diffSeats.get(d) ?? 0) + 1);
      if (r.winnerDifficulty) diffWins.set(r.winnerDifficulty, (diffWins.get(r.winnerDifficulty) ?? 0) + 1);
    }
    console.log('Win rate by AI difficulty (wins / seats):');
    for (const d of ['squire', 'knight', 'warlord']) {
      const seats = diffSeats.get(d) ?? 0;
      const wins = diffWins.get(d) ?? 0;
      console.log(`  ${d.padEnd(8)} ${String(wins).padStart(3)} / ${String(seats).padStart(3)}  ${seats > 0 ? Math.round((wins / seats) * 100) : 0}%`);
    }
    const avgBattles = records.reduce((s, r) => s + r.battles, 0) / records.length;
    const avgChron = records.reduce((s, r) => s + r.chronicleEntries, 0) / records.length;
    console.log(`Average battles/game: ${avgBattles.toFixed(1)}, chronicle entries/game: ${avgChron.toFixed(0)}`);
    // signature usage: the balance gate wants every lord firing theirs
    const sigUses = new Map<string, number>();
    for (const r of records) {
      for (const [lord, n] of Object.entries(r.signatureUses ?? {})) {
        sigUses.set(lord, (sigUses.get(lord) ?? 0) + n);
      }
    }
    console.log('Signature uses (total / per seat at the table):');
    for (const [lord, games] of [...byLordGames.entries()].sort()) {
      const uses = sigUses.get(lord) ?? 0;
      console.log(`  ${(LORD_BY_ID[lord]?.name ?? lord).padEnd(24)} ${String(uses).padStart(4)}   ${(uses / Math.max(1, games)).toFixed(1)}/seat`);
    }
  }
  // ---- the mirror gates: statistics, not vibes -------------------------
  const gateFailures: string[] = [];
  if (MIRROR && records.length > 0) {
    const gate = records.length >= 300; // below 300 games: print, don't judge
    console.log(`\nMirror gates (${gate ? 'ENFORCED' : `advisory below 300 games — ${records.length} played`}):`);
    // Φ via Abramowitz–Stegun 7.1.26 — plenty for a 1% gate
    const phi = (z: number): number => {
      const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
      const x = Math.abs(z) / Math.SQRT2;
      const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
    };
    const perLord = new Map<string, { wins: number; seats: number; expected: number; variance: number }>();
    for (const r of records) {
      for (const lord of r.seatLords) {
        const s = perLord.get(lord) ?? { wins: 0, seats: 0, expected: 0, variance: 0 };
        s.seats += 1;
        const p = 1 / r.players;
        s.expected += p;
        s.variance += p * (1 - p);
        perLord.set(lord, s);
      }
      if (r.winnerLord) perLord.get(r.winnerLord)!.wins += 1;
    }
    console.log('  Lord fairness (observed vs seat-weighted expectation, two-sided p):');
    for (const [lord, s] of [...perLord.entries()].sort()) {
      const z = s.variance > 0 ? (s.wins - s.expected) / Math.sqrt(s.variance) : 0;
      const p = 2 * (1 - phi(Math.abs(z)));
      // Wilson 95% interval on the raw per-seat rate, for the report
      const n = s.seats; const w = s.wins / Math.max(1, n); const zz = 1.96;
      const den = 1 + zz * zz / n;
      const mid = (w + zz * zz / (2 * n)) / den;
      const half = (zz * Math.sqrt((w * (1 - w) + zz * zz / (4 * n)) / n)) / den;
      const verdict = p < 0.01 ? '✗ OUTSIDE' : '✓';
      console.log(`    ${(LORD_BY_ID[lord]?.name ?? lord).padEnd(24)} ${String(s.wins).padStart(3)}/${String(s.seats).padEnd(3)} exp ${s.expected.toFixed(1).padStart(5)}  CI ${(100 * (mid - half)).toFixed(0)}–${(100 * (mid + half)).toFixed(0)}%  p=${p.toFixed(3)} ${verdict}`);
      if (gate && p < 0.01) gateFailures.push(`${lord}: wins ${s.wins} vs expected ${s.expected.toFixed(1)} over ${s.seats} seats (p=${p.toFixed(4)})`);
    }
    const byPath2 = new Map<string, number>();
    for (const r of records) byPath2.set(String(r.path), (byPath2.get(String(r.path)) ?? 0) + 1);
    const share = (path: string): number => (byPath2.get(path) ?? 0) / records.length;
    if (gate && share('dominion') > 0.40) gateFailures.push(`dominion carries ${Math.round(share('dominion') * 100)}% of endings (gate: ≤40%)`);
    for (const path of ['conquest', 'legend', 'chronicle']) {
      if (gate && share(path) < 0.04) gateFailures.push(`${path} at ${Math.round(share(path) * 100)}% of endings (gate: ≥4%)`);
    }
    // Golden Age is a rare-prestige ending by decision (ROADMAP §2.1) — it
    // must stay reachable, not common
    if (gate && (byPath2.get('goldenAge') ?? 0) === 0) gateFailures.push('goldenAge never occurred (gate: ≥1 per 300)');
    const sigUses2 = new Map<string, number>();
    const sigSeats = new Map<string, number>();
    for (const r of records) {
      for (const lord of r.seatLords) sigSeats.set(lord, (sigSeats.get(lord) ?? 0) + 1);
      for (const [lord, n] of Object.entries(r.signatureUses ?? {})) sigUses2.set(lord, (sigUses2.get(lord) ?? 0) + n);
    }
    for (const [lord, seats] of sigSeats) {
      const rate = (sigUses2.get(lord) ?? 0) / seats;
      if (gate && rate < 1.0) gateFailures.push(`${lord} fires their signature ${rate.toFixed(1)}×/seat (gate: ≥1.0)`);
    }
    if (gateFailures.length > 0) {
      console.log('  ✗ GATES FAILED:');
      for (const g of gateFailures) console.log(`    ${g}`);
    } else {
      console.log(`  ✓ Gates ${gate ? 'pass' : 'would pass (advisory)'}: fairness, ending bands, signature floor.`);
    }
  }

  if (failures.length > 0) {
    console.log(`\n✗ ${failures.length} FAILURES:`);
    for (const f of failures) console.log(`  ${f}`);
  } else {
    console.log('\n✓ No crashes. Every game terminated with a winner. Invariants held every round.');
  }
  writeFileSync('sim-report.json', JSON.stringify({
    when: new Date().toISOString(),
    rulesVersion: RULES_VERSION,
    mirror: MIRROR,
    config: { games: GAMES, seedPrefix: SEED_PREFIX },
    completed: records.length,
    attempted: GAMES,
    games: records,
    failures,
    gateFailures,
  }, null, 2));
  console.log('Report written to sim-report.json');
  if (failures.length > 0 || gateFailures.length > 0) process.exit(1);
}

main();
