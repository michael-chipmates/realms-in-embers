/**
 * Victory paths and the guarantee that every game ends.
 * All progress is public and countdowns are chronicled — nobody wins quietly.
 */
import { incomeReport } from './economy';
import { heroesOf, lordName, provincesOf } from './helpers';
import { say } from './narrator';
import type { Rng } from './rng';
import type { Effect, GameState, PlayerId, VictoryPath } from './types';

export const DOMINION_SHARE = 0.55;
export const DOMINION_ROUNDS = 3;
export const GOLDEN_GOLD = 1200;
export const GOLDEN_ORDER = 65;
export const GOLDEN_ROUNDS = 4;

export interface ScoreLine {
  label: string;
  amount: number;
}

/** Chronicle-close scoring — itemized for the summary screen. */
export function chronicleScore(state: GameState, pid: PlayerId): { total: number; lines: ScoreLine[] } {
  const player = state.players[pid];
  const lines: ScoreLine[] = [];
  if (!player.alive) {
    const held = 0;
    lines.push({ label: 'Banner fallen before the close', amount: held });
    return { total: 0, lines };
  }
  const provinces = provincesOf(state, pid);
  const provincePts = provinces.length * 12;
  lines.push({ label: `${provinces.length} provinces held`, amount: provincePts });
  const income = incomeReport(state, pid);
  const incomePts = Math.round(Math.max(0, income.net) * 0.6);
  lines.push({ label: `Net income ${income.net}`, amount: incomePts });
  const goldPts = Math.round(player.gold * 0.05);
  lines.push({ label: `Treasury ${Math.round(player.gold)}`, amount: goldPts });
  const orderAvg = provinces.length > 0 ? provinces.reduce((s, p) => s + p.order, 0) / provinces.length : 0;
  const orderPts = Math.round(orderAvg * 0.5);
  lines.push({ label: `Average order ${Math.round(orderAvg)}`, amount: orderPts });
  const heroLevels = heroesOf(state, pid).reduce((s, h) => s + h.level, 0);
  const heroPts = heroLevels * 6;
  lines.push({ label: `Heroes of renown (levels ${heroLevels})`, amount: heroPts });
  const artifacts = heroesOf(state, pid).reduce(
    (s, h) => s + Number(h.artifacts.weapon !== null) + Number(h.artifacts.armor !== null) + Number(h.artifacts.trinket !== null),
    0,
  ) + player.vault.length;
  if (artifacts > 0) lines.push({ label: `${artifacts} artifacts recovered`, amount: artifacts * 8 });
  if (player.sagaChapter > 0) lines.push({ label: `Saga: ${player.sagaChapter} of 5 chapters`, amount: player.sagaChapter * 25 });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { total, lines };
}

function setWinner(state: GameState, rng: Rng, pid: PlayerId, path: VictoryPath | 'chronicle', effects: Effect[]): void {
  if (state.phase === 'ended') return;
  state.phase = 'ended';
  state.victory.winner = pid;
  state.victory.winPath = path;
  effects.push({ e: 'victory', player: pid, path });
  const how: Record<string, string> = {
    conquest: 'the last banner standing over a realm of ash and obedience',
    dominion: 'holding the great share of the realm until no argument remained',
    goldenAge: 'not by the sword, but by full granaries, quiet streets, and a treasury that ended the war by making it pointless',
    legend: 'by the Saga fulfilled — the Ember Throne rekindled by a living legend',
    chronicle: 'by the judgment of the Chronicle when the page ran out',
  };
  if (path === 'chronicle') {
    say(state, rng, 'chronicleClose', { lord: lordName(state, pid), turns: state.victory.maxTurns }, { about: pid });
  } else {
    say(state, rng, 'victory', { lord: lordName(state, pid), how: how[path] }, { about: pid });
  }
}

/** Run at every round end (and after eliminations). */
export function checkVictory(state: GameState, rng: Rng, effects: Effect[]): void {
  if (state.phase === 'ended') return;
  const paths = state.victory.paths;
  const alive = state.players.filter((p) => p.alive);

  // conquest — always checked; a war with one claimant left is simply over
  if (alive.length === 1) {
    setWinner(state, rng, alive[0].id, paths.includes('conquest') ? 'conquest' : 'chronicle', effects);
    return;
  }
  if (alive.length === 0) {
    // mutual annihilation: the chronicle picks over the ruins (should be unreachable)
    setWinner(state, rng, 0, 'chronicle', effects);
    return;
  }

  const total = state.provinces.length;

  // dominion
  if (paths.includes('dominion')) {
    for (const player of alive) {
      const share = provincesOf(state, player.id).length / total;
      const prev = state.victory.dominionStreak[player.id] ?? 0;
      if (share >= DOMINION_SHARE) {
        const streak = prev + 1;
        state.victory.dominionStreak[player.id] = streak;
        if (streak >= DOMINION_ROUNDS) {
          setWinner(state, rng, player.id, 'dominion', effects);
          return;
        }
        say(state, rng, 'dominionWarning', { lord: lordName(state, player.id), rounds: DOMINION_ROUNDS - streak }, { about: player.id });
      } else if (prev > 0) {
        state.victory.dominionStreak[player.id] = 0;
      }
    }
  }

  // golden age
  if (paths.includes('goldenAge')) {
    for (const player of alive) {
      const provinces = provincesOf(state, player.id);
      const orderAvg = provinces.length > 0 ? provinces.reduce((s, p) => s + p.order, 0) / provinces.length : 0;
      const richest = alive.every((o) => o.id === player.id || o.gold <= player.gold);
      const qualifies = player.gold >= GOLDEN_GOLD && orderAvg >= GOLDEN_ORDER && richest && provinces.length >= 3;
      const prev = state.victory.goldenStreak[player.id] ?? 0;
      if (qualifies) {
        const streak = prev + 1;
        state.victory.goldenStreak[player.id] = streak;
        if (streak >= GOLDEN_ROUNDS) {
          setWinner(state, rng, player.id, 'goldenAge', effects);
          return;
        }
        say(state, rng, 'goldenWarning', { lord: lordName(state, player.id), rounds: GOLDEN_ROUNDS - streak }, { about: player.id });
      } else if (prev > 0) {
        state.victory.goldenStreak[player.id] = 0;
      }
    }
  }

  // legend
  if (paths.includes('legend')) {
    for (const player of alive) {
      if (player.sagaChapter >= 5) {
        setWinner(state, rng, player.id, 'legend', effects);
        return;
      }
    }
  }

  // the chronicle always ends
  if (state.turn >= state.victory.maxTurns) {
    let best: PlayerId = alive[0].id;
    let bestScore = -1;
    for (const player of alive) {
      const { total: score } = chronicleScore(state, player.id);
      if (score > bestScore) {
        bestScore = score;
        best = player.id;
      }
    }
    setWinner(state, rng, best, 'chronicle', effects);
  }
}
