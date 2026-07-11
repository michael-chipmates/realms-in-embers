/**
 * Public engine API: create, act, save, load, replay.
 * The UI and the sim harness both drive the game exclusively through this.
 */
import { applyAction } from './actions';
import { Rng } from './rng';
import { initGame, RULES_VERSION } from './state';
import { beginTurn } from './turn';
import type { Action, Effect, GameSettings, GameState, LoggedAction } from './types';

export { applyAction } from './actions';
export { moveTargets, entryKind } from './actions';
export { previewBattle } from './combat';
export { defaultSettings } from './state';

export interface NewGame {
  state: GameState;
  effects: Effect[];
}

export function createGame(settings: GameSettings): NewGame {
  const state = initGame(settings);
  const effects: Effect[] = [];
  const rng = new Rng(state.rng);
  beginTurn(state, rng, effects);
  return { state, effects };
}

// ------------------------------------------------------------------- saves

export interface SaveFile {
  app: 'realms-in-embers';
  v: 1;
  savedTurn: number;
  state: GameState;
}

export function serializeGame(state: GameState): string {
  const file: SaveFile = { app: 'realms-in-embers', v: 1, savedTurn: state.turn, state };
  return JSON.stringify(file);
}

export function deserializeGame(json: string): GameState {
  const file = JSON.parse(json) as SaveFile;
  if (file.app !== 'realms-in-embers') throw new Error('Not a Realms in Embers save.');
  if (file.v !== 1) throw new Error(`Save version ${file.v} is not supported.`);
  const state = file.state;
  // Saves from any rules version <= current load and play forward correctly
  // (the rng stream lives in the state). Only byte-exact log REPLAY is
  // version-bound; see RULES_VERSION in state.ts.
  if (!state || typeof state.v !== 'number' || state.v < 1 || state.v > RULES_VERSION
    || !Array.isArray(state.rng) || !Array.isArray(state.provinces)) {
    throw new Error('The save is damaged or from a newer age — the chronicle cannot be reopened.');
  }
  // saves from before rules v11 predate signature abilities
  for (const p of state.players) p.signatureCooldownLeft ??= 0;
  return state;
}

// ------------------------------------------------------------------ replay

/**
 * Rebuild a game from its settings and action log. Deterministic: the result
 * must equal the state the log was taken from (tests enforce this).
 */
export function replayGame(settings: GameSettings, log: LoggedAction[]): GameState {
  const { state } = createGame(settings);
  for (const entry of log) {
    if (state.phase === 'ended') break;
    if (entry.turn !== state.turn || entry.player !== state.current) {
      throw new Error(
        `Replay diverged before turn ${entry.turn} (${entry.action.t}): ` +
        `log expects player ${entry.player} on turn ${entry.turn}, state is at player ${state.current}, turn ${state.turn}`,
      );
    }
    const result = applyAction(state, entry.action);
    if (!result.ok) {
      throw new Error(
        `Replay diverged at turn ${entry.turn} (${entry.action.t}): ${result.error ?? 'unknown'}`,
      );
    }
  }
  return state;
}

/** Convenience for drivers: dispatch and get effects; throws never. */
export function act(state: GameState, action: Action): { ok: boolean; error?: string; effects: Effect[] } {
  try {
    return applyAction(state, action);
  } catch (err) {
    // A crash inside an action is a bug; surface it loudly in dev, but never
    // let one wedge a running game or sim.
    return { ok: false, error: `Engine error: ${err instanceof Error ? err.message : String(err)}`, effects: [] };
  }
}
