/**
 * Attitude: how one lord regards another, itemized so the player can always
 * read WHY. Deeds decay a little each round — memory fades, slowly, and
 * broken oaths fade slowest of all (their decay rates are set where the
 * deed is written).
 */
import { creedAffinity } from './content/world';
import { creedOf, deedsOf, getStance, lordOf, provincesOf } from './helpers';
import { leaderId } from './economy';
import type { GameState, PlayerId } from './types';

export interface AttitudeLine {
  label: string;
  amount: number;
}

export interface Attitude {
  total: number;
  lines: AttitudeLine[];
}

export function attitudeOf(state: GameState, viewer: PlayerId, about: PlayerId): Attitude {
  const lines: AttitudeLine[] = [];
  if (viewer === about || viewer < 0 || about < 0) return { total: 0, lines };
  const v = state.players[viewer];
  const a = state.players[about];

  const creeds = creedAffinity(creedOf(v), creedOf(a));
  if (creeds !== 0) {
    const label = creeds > 0 ? `Shared creed (${creedOf(v) === 'flame' ? 'the Flame' : creedOf(v) === 'ash' ? 'the Ash' : 'the Umbra'})` : creeds <= -20 ? 'Creeds opposed as fire and dark' : 'Different ways';
    lines.push({ label, amount: creeds });
  }

  const stance = getStance(state, viewer, about);
  if (stance === 'war') lines.push({ label: 'At war', amount: -20 });
  if (stance === 'pact') lines.push({ label: 'Bound by pact', amount: 8 });
  if (stance === 'alliance') lines.push({ label: 'Sworn allies', amount: 18 });

  // fear of the mighty
  const total = state.provinces.length;
  const share = provincesOf(state, about).length / total;
  if (share > 0.3) {
    const fear = -Math.round((share - 0.3) * 90);
    lines.push({ label: `Grown too mighty (${Math.round(share * 100)}% of the realm)`, amount: fear });
  }

  // common cause against a runaway leader
  const lead = leaderId(state);
  if (lead !== null && lead !== viewer && lead !== about) {
    const viewerAtWar = getStance(state, viewer, lead) === 'war';
    const aboutAtWar = getStance(state, about, lead) === 'war';
    if (viewerAtWar && aboutAtWar) {
      lines.push({ label: 'We fight the same tyrant', amount: 10 });
    }
  }

  // border friction: neighbors rub
  let sharedBorders = 0;
  for (const p of provincesOf(state, viewer)) {
    if (p.neighbors.some((n) => state.provinces[n].owner === about)) sharedBorders++;
  }
  if (sharedBorders >= 2) {
    lines.push({ label: `Crowded borders (${sharedBorders} marches)`, amount: -Math.min(8, sharedBorders * 2) });
  }

  // memory
  for (const deed of deedsOf(state, viewer, about)) {
    const amount = Math.round(deed.delta);
    if (amount !== 0) lines.push({ label: `${deed.label} (season ${deed.turn})`, amount });
  }

  // temperament: loyal lords forgive less, proud lords bristle at upstarts
  const personality = lordOf(v).personality;
  const deedSum = deedsOf(state, viewer, about).reduce((s, d) => s + d.delta, 0);
  if (deedSum < -15 && personality.loyalty > 0.7) {
    lines.push({ label: 'Does not forget', amount: -6 });
  }

  const sum = lines.reduce((s, l) => s + l.amount, 0);
  return { total: Math.max(-100, Math.min(100, Math.round(sum))), lines };
}

/** Round-end memory decay. Deltas drift toward zero by their decay rate. */
export function decayDeeds(state: GameState): void {
  for (const key of Object.keys(state.deeds)) {
    const list = state.deeds[key];
    for (const deed of list) {
      if (deed.delta > 0) deed.delta = Math.max(0, deed.delta - deed.decay);
      else if (deed.delta < 0) deed.delta = Math.min(0, deed.delta + deed.decay);
    }
    state.deeds[key] = list.filter((d) => Math.abs(d.delta) >= 1);
    if (state.deeds[key].length === 0) delete state.deeds[key];
  }
}
