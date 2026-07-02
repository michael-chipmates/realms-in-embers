/**
 * Actions for heroes' gear, skills, quests, rites, spells and events.
 * This module is replaced wholesale when those systems land; until then any
 * such action is cleanly refused (no current caller can emit them).
 */
import type { Rng } from './rng';
import type { Action, Effect, GameState, PlayerId } from './types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  effects: Effect[];
}

export function applyAdvancedAction(
  _state: GameState,
  _rng: Rng,
  _pid: PlayerId,
  _action: Action,
  _effects: Effect[],
): ActionResult {
  return { ok: false, error: 'Not possible.', effects: [] };
}
