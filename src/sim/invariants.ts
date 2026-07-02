/**
 * Structural invariants checked after every simulated round — and usable by
 * any test that drives full games.
 */
import { UNITS } from '../engine/content/units';
import type { GameState } from '../engine/types';

export function checkInvariants(state: GameState, seed: string): void {
  const die = (msg: string): never => {
    throw new Error(`[${seed} turn ${state.turn}] invariant violated: ${msg}`);
  };
  for (const player of state.players) {
    if (!Number.isFinite(player.gold) || player.gold < 0) die(`gold ${player.gold} for player ${player.id}`);
    if (!Number.isFinite(player.emberlight) || player.emberlight < 0) die(`emberlight for ${player.id}`);
  }
  for (const [idStr, army] of Object.entries(state.armies)) {
    if (army.id !== Number(idStr)) die(`army id mismatch ${idStr}`);
    if (army.owner < -1 || army.owner >= state.players.length) die(`army owner ${army.owner}`);
    if (!state.provinces[army.province]) die(`army province ${army.province}`);
    if (army.units.length === 0) die(`empty army ${army.id}`);
    if (army.units.length > 12) die(`overstacked army ${army.id}: ${army.units.length}`);
    for (const u of army.units) {
      const def = UNITS[u.type];
      if (!def) die(`unknown unit ${u.type}`);
      if (u.hits < 1 || u.hits > def.hits) die(`unit hits ${u.hits}/${def.hits}`);
    }
    for (const hid of army.heroIds) {
      const hero = state.heroes[hid];
      if (!hero) die(`army ${army.id} refers to missing hero ${hid}`);
      if (hero.armyId !== army.id) die(`hero ${hid} backlink broken`);
      if (hero.status === 'dead') die(`dead hero ${hid} still marching`);
    }
  }
  for (const hero of Object.values(state.heroes)) {
    if (hero.status === 'dead') continue;
    if (hero.armyId !== null) {
      const army = state.armies[hero.armyId];
      if (!army) die(`hero ${hero.id} attached to missing army`);
      if (!army.heroIds.includes(hero.id)) die(`hero ${hero.id} not in army roster`);
    }
    if (!state.provinces[hero.province]) die(`hero ${hero.id} in missing province`);
  }
  for (const p of state.provinces) {
    if (p.owner < -1 || p.owner >= state.players.length) die(`province ${p.id} owner ${p.owner}`);
    if (p.owner >= 0 && !state.players[p.owner].alive) die(`province ${p.id} owned by dead player`);
    if (p.order < 0 || p.order > 100) die(`province ${p.id} order ${p.order}`);
    if (p.prosperity < 0.4 || p.prosperity > 1.4) die(`province ${p.id} prosperity ${p.prosperity}`);
    if (new Set(p.buildings).size !== p.buildings.length) die(`province ${p.id} duplicate buildings`);
  }
  for (const entry of state.chronicle) {
    if (!entry.text || entry.text.trim().length < 8) die('empty chronicle entry');
    if (entry.text.includes('undefined') || entry.text.includes('[object')) die(`broken chronicle text: ${entry.text}`);
  }
}

