/** Small shared utilities over GameState. Pure, no DOM, no side channels. */
import { LORD_BY_ID, type LordDef } from './content/lords';
import { UNITS } from './content/units';
import { teach } from './teachings';
import type {
  Army, Creed, DiploDeed, DiploStance, GameState, Player, PlayerId, Province, UnitInstance, UnitTypeId,
} from './types';
import { NEUTRAL } from './types';

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Symmetric key for stances. */
export function stanceKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Directional key: how `viewer` remembers `about`. */
export function viewKey(viewer: PlayerId, about: PlayerId): string {
  return `${viewer}>${about}`;
}

export function getStance(state: GameState, a: PlayerId, b: PlayerId): DiploStance {
  if (a === b) return 'peace';
  if (a === NEUTRAL || b === NEUTRAL) return 'war';
  return state.stances[stanceKey(a, b)] ?? 'peace';
}

export function setStance(state: GameState, a: PlayerId, b: PlayerId, stance: DiploStance): void {
  state.stances[stanceKey(a, b)] = stance;
}

export function atWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return a !== b && getStance(state, a, b) === 'war';
}

export function addDeed(state: GameState, viewer: PlayerId, about: PlayerId, deed: Omit<DiploDeed, 'turn'>): void {
  if (viewer === NEUTRAL || about === NEUTRAL || viewer === about) return;
  const key = viewKey(viewer, about);
  const list = state.deeds[key] ?? (state.deeds[key] = []);
  list.push({ ...deed, turn: state.turn });
  if (list.length > 14) list.shift();
}

export function deedsOf(state: GameState, viewer: PlayerId, about: PlayerId): DiploDeed[] {
  return state.deeds[viewKey(viewer, about)] ?? [];
}

export function lordOf(player: Player): LordDef {
  return LORD_BY_ID[player.lordId];
}

export function creedOf(player: Player): Creed {
  return lordOf(player).creed;
}

export function lordName(state: GameState, pid: PlayerId): string {
  if (pid === NEUTRAL) return 'the leaderless';
  return lordOf(state.players[pid]).name;
}

export function provincesOf(state: GameState, pid: PlayerId): Province[] {
  return state.provinces.filter((p) => p.owner === pid);
}

export function armiesOf(state: GameState, pid: PlayerId): Army[] {
  return Object.values(state.armies).filter((a) => a.owner === pid);
}

export function armiesIn(state: GameState, province: number): Army[] {
  return Object.values(state.armies).filter((a) => a.province === province);
}

export function heroesOf(state: GameState, pid: PlayerId) {
  return Object.values(state.heroes).filter((h) => h.owner === pid && h.status !== 'dead');
}

/** Where a hero actually stands (their army's province when attached). */
export function heroProvince(state: GameState, hero: { armyId: number | null; province: number }): number {
  if (hero.armyId !== null) {
    const army = state.armies[hero.armyId];
    if (army) return army.province;
  }
  return hero.province;
}

export function makeUnits(type: UnitTypeId, count: number, vet: 0 | 1 | 2 = 0): UnitInstance[] {
  const def = UNITS[type];
  return Array.from({ length: count }, () => ({ type, hits: def.hits, vet }));
}

export function newArmy(
  state: GameState,
  owner: PlayerId,
  province: number,
  units: UnitInstance[],
  opts: Partial<Pick<Army, 'stance' | 'kind' | 'moved'>> = {},
): Army {
  const army: Army = {
    id: state.nextArmyId++,
    owner,
    province,
    units,
    heroIds: [],
    moved: opts.moved ?? false,
    stance: opts.stance ?? 'measured',
    ...(opts.kind ? { kind: opts.kind } : {}),
  };
  state.armies[army.id] = army;
  return army;
}

export function removeArmy(state: GameState, armyId: number): void {
  const army = state.armies[armyId];
  if (!army) return;
  for (const hid of army.heroIds) {
    const hero = state.heroes[hid];
    if (hero) hero.armyId = null;
  }
  delete state.armies[armyId];
}

/** Squad count string like "7 companies" for chronicle text. */
export function armySizeText(army: Army): string {
  const n = army.units.length;
  return n === 1 ? 'one company' : `${n} companies`;
}

export function provinceDist(a: Province, b: Province): number {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

/** Graph distance (marches) between provinces; -1 if unreachable by land. */
export function marchDistance(state: GameState, from: number, to: number): number {
  if (from === to) return 0;
  const dist = new Map<number, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const n of state.provinces[cur].neighbors) {
      if (!dist.has(n)) {
        if (n === to) return d + 1;
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return -1;
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

/** Register a new artifact instance and place it in a player's vault. */
export function grantArtifactTo(state: GameState, pid: PlayerId, defId: string): number {
  const id = state.nextArtifactId++;
  state.artifacts[id] = { id, defId, foundTurn: state.turn, history: [] };
  if (pid >= 0) {
    state.players[pid].vault.push(id);
    state.artifacts[id].history.push(lordName(state, pid));
    teach(state, pid, 'firstArtifact');
  }
  return id;
}

/** Artifact def-ids already existing anywhere in this world (no duplicates). */
export function artifactDefIdsInPlay(state: GameState): Set<string> {
  return new Set(Object.values(state.artifacts).map((a) => a.defId));
}

/** Total army strength points for ranking/threat (cheap, not battle math). */
export function roughArmyPower(army: Army): number {
  let power = 0;
  for (const u of army.units) {
    const def = UNITS[u.type];
    power += (def.atk + def.def) * (u.hits / def.hits) * (1 + u.vet * 0.12);
  }
  return power;
}

export function playerPower(state: GameState, pid: PlayerId): number {
  return armiesOf(state, pid).reduce((sum, a) => sum + roughArmyPower(a), 0);
}

/** Everything `viewer` can see under fog: their own memory plus, while an
 * alliance holds, everything their allies can see. Shared maps are one of
 * the concrete privileges of a full alliance. */
export function seenBy(state: GameState, viewer: PlayerId): Set<number> {
  const out = new Set(state.players[viewer].seen);
  for (const p of state.players) {
    if (p.id !== viewer && p.alive && getStance(state, viewer, p.id) === 'alliance') {
      for (const id of p.seen) out.add(id);
    }
  }
  return out;
}
