/**
 * The war, replayed: rebuild ownership per round from the deterministic
 * action log. Purely derived — the engine's replay IS the data source.
 */
import { applyAction, createGame } from '../engine/engine';
import type { GameState } from '../engine/types';

export interface WarTimeline {
  /** Round numbers, ascending. */
  rounds: number[];
  /** owners[i][provinceId] = owner at the start of rounds[i]. */
  owners: number[][];
}

export function buildWarTimeline(state: GameState): WarTimeline {
  const sim = createGame(state.settings).state;
  const rounds: number[] = [sim.turn];
  const owners: number[][] = [sim.provinces.map((p) => p.owner)];
  let lastTurn = sim.turn;
  for (const entry of state.log) {
    if (sim.phase === 'ended') break;
    applyAction(sim, entry.action);
    if (sim.turn !== lastTurn) {
      lastTurn = sim.turn;
      rounds.push(sim.turn);
      owners.push(sim.provinces.map((p) => p.owner));
    }
  }
  // close with the world as it truly ended
  rounds.push(state.turn);
  owners.push(state.provinces.map((p) => p.owner));
  return { rounds, owners };
}
