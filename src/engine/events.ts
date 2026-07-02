/**
 * Event flow: draw at turn start, resolve by choice (human via UI, AI by
 * temperament). Resolutions write themselves into the chronicle.
 */
import { EVENT_BY_ID, EVENTS, type EventCtx } from './content/events';
import { lordOf } from './helpers';
import { scribe } from './narrator';
import { teach } from './teachings';
import type { Rng } from './rng';
import type { Effect, GameState, PlayerId } from './types';

const DRAW_CHANCE = 0.3;

export function drawEvent(state: GameState, rng: Rng, pid: PlayerId, effects: Effect[]): void {
  const player = state.players[pid];
  if (state.pendingEvents.some((e) => e.player === pid)) return; // one at a time
  if (state.turn < 3) return; // let the opening breathe
  if (!rng.chance(DRAW_CHANCE)) return;

  const eligible = EVENTS.filter((def) => {
    if (def.once && player.flags[`ev:${def.id}`]) return false;
    const cdFlag = Object.keys(player.flags).find((f) => f.startsWith(`evCd:${def.id}:`));
    if (cdFlag) {
      const until = parseInt(cdFlag.split(':')[2], 10);
      if (state.turn < until) return false;
      delete player.flags[cdFlag];
    }
    return def.when(state, pid, rng) !== null;
  });
  if (eligible.length === 0) return;
  const def = rng.pickWeighted(eligible, (d) => d.weight);
  const binding = def.when(state, pid, rng);
  if (!binding) return;
  const instance = {
    id: state.nextEventId++,
    defId: def.id,
    player: pid,
    province: binding.province,
    heroId: binding.heroId,
    turn: state.turn,
  };
  state.pendingEvents.push(instance);
  teach(state, pid, 'firstEvent');
  effects.push({ e: 'eventFired', eventId: instance.id });
}

export function resolveEventChoice(
  state: GameState,
  rng: Rng,
  pid: PlayerId,
  eventId: number,
  choiceIdx: number,
  effects: Effect[],
): { ok: boolean; error?: string } {
  const idx = state.pendingEvents.findIndex((e) => e.id === eventId && e.player === pid);
  if (idx === -1) return { ok: false, error: 'That moment has passed.' };
  const instance = state.pendingEvents[idx];
  const def = EVENT_BY_ID[instance.defId];
  if (!def) return { ok: false, error: 'The event is lost to the record.' };
  const choice = def.choices[choiceIdx];
  if (!choice) return { ok: false, error: 'No such course.' };

  state.pendingEvents.splice(idx, 1);
  const player = state.players[pid];
  player.flags[`ev:${def.id}`] = true;
  player.flags[`evCd:${def.id}:${state.turn + def.cooldown}`] = true;

  const ctx: EventCtx = { state, rng, pid, province: instance.province, heroId: instance.heroId, effects };
  const resolution = choice.apply(ctx);
  scribe(state, {
    kind: 'event',
    about: pid,
    text: `${def.title} — ${resolution}`,
  });
  effects.push({ e: 'chronicle', entry: state.chronicle[state.chronicle.length - 1] });
  return { ok: true };
}

/** AI: pick the temperament-best choice for every pending event. */
export function aiResolveEvents(state: GameState, rng: Rng, pid: PlayerId, dispatchChoice: (eventId: number, idx: number) => void): void {
  const persona = lordOf(state.players[pid]).personality;
  for (const instance of state.pendingEvents.filter((e) => e.player === pid)) {
    const def = EVENT_BY_ID[instance.defId];
    if (!def) continue;
    const ctx: EventCtx = { state, rng, pid, province: instance.province, heroId: instance.heroId, effects: [] };
    let best = 0;
    let bestScore = -Infinity;
    def.choices.forEach((choice, idx) => {
      const score = choice.aiScore(persona, ctx);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    });
    dispatchChoice(instance.id, best);
  }
}

/** Event text for the UI (bound to its instance). */
export function eventText(state: GameState, eventId: number): { title: string; text: string; choices: { label: string; preview: string }[] } | null {
  const instance = state.pendingEvents.find((e) => e.id === eventId);
  if (!instance) return null;
  const def = EVENT_BY_ID[instance.defId];
  if (!def) return null;
  const ctx: EventCtx = { state, rng: null as never, pid: instance.player, province: instance.province, heroId: instance.heroId, effects: [] };
  return {
    title: def.title,
    text: def.text(ctx),
    choices: def.choices.map((c) => ({ label: c.label, preview: c.preview })),
  };
}
