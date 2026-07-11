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
export { evaluateAction, evaluateActions } from './evaluate';
export type { ActionEvaluation, ActionCost, CodexRef } from './evaluate';

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

/**
 * The save-migration registry: saves from ANY older rules version load and
 * play forward — LOADING is forever, only byte-exact log REPLAY is
 * version-bound (the fixture canary). Each entry upgrades the shape one
 * rules version introduced; they run in order against saves older than
 * `sinceRules`. Purely additive versions need no entry, and this list plus
 * the tests in tests/migrations.test.ts are the registry of record.
 */
const SAVE_MIGRATIONS: { sinceRules: number; note: string; apply: (state: GameState) => void }[] = [
  {
    sinceRules: 11,
    note: 'signature abilities: players gained signatureCooldownLeft',
    apply: (state) => {
      for (const p of state.players) p.signatureCooldownLeft ??= 0;
    },
  },
  // v12 (victory resolution), v13 (digest flags on new entries), v14
  // (Army.lastMove, optional), v15 (AI + tuning only): additive — no shape
  // change, nothing to migrate.
];

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
  for (const migration of SAVE_MIGRATIONS) {
    if (state.v < migration.sinceRules) migration.apply(state);
  }
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
