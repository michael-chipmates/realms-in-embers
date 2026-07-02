/** Tiny formatting helpers shared across panels. */
import { LORD_BY_ID } from '../engine/content/lords';
import type { GameState, PlayerId } from '../engine/types';

export const fmt = (n: number): string => String(Math.round(n));
export const signed = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n)}`;

export function lordDisplay(state: GameState, pid: PlayerId): { name: string; epithet: string; color: string; pattern: string } {
  if (pid < 0) return { name: 'The Leaderless', epithet: 'no banner', color: '#777', pattern: 'plain' };
  const lord = LORD_BY_ID[state.players[pid].lordId];
  return { name: lord.name, epithet: lord.epithet, color: lord.color, pattern: lord.pattern };
}

export function seasonName(turn: number): string {
  const seasons = ['Thaw', 'Sowing', 'High Sun', 'Harvest', 'Gloaming', 'Deep Frost'];
  return `${seasons[(turn - 1) % 6]}, year ${Math.floor((turn - 1) / 6) + 41}`;
}

export function playerColors(state: GameState): Record<number, string> {
  const out: Record<number, string> = {};
  for (const p of state.players) out[p.id] = LORD_BY_ID[p.lordId].color;
  return out;
}

export function playerPatterns(state: GameState): Record<number, string> {
  const out: Record<number, string> = {};
  for (const p of state.players) out[p.id] = LORD_BY_ID[p.lordId].pattern;
  return out;
}
