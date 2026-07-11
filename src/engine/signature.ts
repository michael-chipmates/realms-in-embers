/**
 * Signature abilities (rules v11): each lord's one active order. The perk is
 * who a lord IS; the signature is what they DO — a cooldown decision, always
 * announced to the whole table in the chronicle, never silent.
 *
 * Magnitudes live in SIGNATURE_TUNING so the Codex and the lords' own desc
 * lines render the same truth (a test pins the descs to this table).
 */
import { makeUnits, newArmy, armiesIn, clamp, lordName, lordOf, provincesOf, seenBy } from './helpers';
import { scribe } from './narrator';
import { teach } from './teachings';
import type { Rng } from './rng';
import type { Action, Effect, GameState, PlayerId } from './types';

export const SIGNATURE_TUNING = {
  seraphine: { order: 8, cooldown: 8 },
  aldric: { knightCompanies: 1, cooldown: 10 },
  halvard: { defense: 0.25, cooldown: 8 },
  lyra: { atkPct: 15, seasons: 3, cooldown: 12 },
  ulvra: { extraMarch: 1, cooldown: 8 },
  maera: { defense: 0.15, seasons: 2, cooldown: 8 },
  cormac: { atkMult: 1.12, cooldown: 8 },
  branwen: { incomeCutPct: 20, seasons: 2, cooldown: 10 },
  corvas: { treasuryPct: 6, minGold: 2, cooldown: 10 },
  nyssa: { order: 15, cooldown: 6 },
  morrikan: { companiesPerBarrow: 2, orderCost: 4, cooldown: 8 },
  vaelia: { plunderMult: 3, seasons: 3, cooldown: 10 },
} as const;

type Result = { ok: true; effects: Effect[] } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

/** Is this player's one-season signature (Cormac, Ulvra) live right now? */
export function signatureSeasonActive(state: GameState, pid: PlayerId): boolean {
  return state.players[pid].signatureTurn === state.turn;
}

export function applySignature(state: GameState, rng: Rng, pid: PlayerId, action: Action & { t: 'signature' }): Result {
  const player = state.players[pid];
  const lord = lordOf(player);
  const sig = lord.signature;
  if ((player.signatureCooldownLeft ?? 0) > 0) {
    return fail(`${sig.name} gathers strength for ${player.signatureCooldownLeft} more ${player.signatureCooldownLeft === 1 ? 'season' : 'seasons'}.`);
  }

  // ---- resolve and validate the target
  let targetPlayer: PlayerId | null = null;
  let province: number | null = null;
  if (sig.target === 'rival') {
    if (action.targetPlayer === undefined) return fail(`${sig.name} needs a rival named.`);
    const t = state.players[action.targetPlayer];
    if (!t || !t.alive || t.id === pid) return fail('Name a living rival.');
    targetPlayer = t.id;
  }
  if (sig.target === 'enemyProvince') {
    if (action.province === undefined) return fail(`${sig.name} needs a province chosen.`);
    const p = state.provinces[action.province];
    if (!p || p.owner < 0 || p.owner === pid) return fail('Choose a province a rival rules.');
    const borders = p.neighbors.some((n) => state.provinces[n].owner === pid);
    if (!borders) return fail('Whispers need ears nearby — the province must border your realm.');
    province = p.id;
    targetPlayer = p.owner;
  }

  const effects: Effect[] = [];
  const mine = provincesOf(state, pid);
  const T = SIGNATURE_TUNING;

  switch (lord.id) {
    case 'seraphine': {
      for (const p of mine) {
        p.order = clamp(p.order + T.seraphine.order, 0, 100);
        p.capturedTurn = 0; // conquered folk are grieving folk; the Vigil sits with them
      }
      scribe(state, { kind: 'realm', about: pid, text: `${lordName(state, pid)} called the Great Vigil: one night, every hearth in her realm tended, every district heard — the newly taken most of all, who forgot for an evening that they were taken. Order rose across her banner (+${T.seraphine.order}).` });
      break;
    }
    case 'aldric': {
      const seat = state.provinces[player.seatProvince];
      if (seat.owner !== pid) return fail('The Royal Muster is called from your own seat — retake it first.');
      const existing = armiesIn(state, seat.id).find((a) => a.owner === pid && a.units.length <= 10);
      if (existing) existing.units.push(...makeUnits('knights', T.aldric.knightCompanies));
      else newArmy(state, pid, seat.id, makeUnits('knights', T.aldric.knightCompanies));
      province = seat.id;
      scribe(state, { kind: 'war', about: pid, text: `${lordName(state, pid)} called the Royal Muster, and the old families answered: Banner Knights ride under the crown at ${seat.name}, unpaid and proud of it.` });
      break;
    }
    case 'halvard': {
      for (const p of mine) {
        p.mods.push({ label: 'Stand Fast', defense: T.halvard.defense, turnsLeft: 1, by: pid, fam: 'ward' });
      }
      scribe(state, { kind: 'war', about: pid, text: `${lordName(state, pid)} walked his walls once, and said nothing. Every province under his banner stands +${Math.round(T.halvard.defense * 100)}% until his next season. The realm understood.` });
      break;
    }
    case 'lyra': {
      player.crusade = { target: targetPlayer!, turnsLeft: T.lyra.seasons };
      scribe(state, { kind: 'war', about: pid, text: `${lordName(state, pid)} swore the Dawn Oath against ${lordName(state, targetPlayer!)} — at sunrise, loudly, off-key. For ${T.lyra.seasons} seasons her attacks on that banner strike +${T.lyra.atkPct}% harder. The whole realm heard the verse.` });
      break;
    }
    case 'ulvra': {
      player.signatureTurn = state.turn;
      scribe(state, { kind: 'realm', about: pid, text: `${lordName(state, pid)} opened the Deep Roads. This season her armies march a province further than any map admits is possible.` });
      break;
    }
    case 'maera': {
      for (const p of mine) {
        p.mods.push({ label: 'Fen Lights', defense: T.maera.defense, turnsLeft: T.maera.seasons, by: pid, fam: 'scry' });
      }
      // the lights also LOOK outward: reveal everything bordering the realm
      const seen = player.seen;
      for (const p of mine) {
        for (const n of p.neighbors) if (!seen.includes(n)) seen.push(n);
      }
      scribe(state, { kind: 'magic', about: pid, text: `Fen Lights walked the borders of ${lordName(state, pid)}'s realm — kindly to her own, deeply misleading to visitors (+${Math.round(T.maera.defense * 100)}% defense, ${T.maera.seasons} seasons), and the marches around her land stand revealed.` });
      break;
    }
    case 'cormac': {
      player.signatureTurn = state.turn;
      scribe(state, { kind: 'war', about: pid, text: `The deepwood went quiet around ${lordName(state, pid)}'s columns. This season his attacks strike +${Math.round((T.cormac.atkMult - 1) * 100)}% harder wherever the battle touches forest. Woodcutters took a sudden holiday.` });
      break;
    }
    case 'branwen': {
      const t = state.players[targetPlayer!];
      t.embargo = { by: pid, turnsLeft: T.branwen.seasons };
      scribe(state, { kind: 'realm', about: pid, text: `${lordName(state, pid)} closed the salt roads against ${lordName(state, targetPlayer!)}: one letter to the guilds, and for ${T.branwen.seasons} seasons that realm's provinces yield ${T.branwen.incomeCutPct}% less gold. The guilds sent their regards, and an invoice.` });
      break;
    }
    case 'corvas': {
      let collected = 0;
      for (const o of state.players) {
        if (!o.alive || o.id === pid) continue;
        const owed = Math.max(T.corvas.minGold, Math.floor(o.gold * (T.corvas.treasuryPct / 100)));
        const paid = Math.min(o.gold, owed);
        o.gold -= paid;
        collected += paid;
      }
      player.gold += collected;
      scribe(state, { kind: 'realm', about: pid, text: `${lordName(state, pid)} called in the debts, and the realm discovered its signatures: ${Math.round(collected)} gold crossed the table to Hollowmere, accompanied by language unfit for this chronicle.` });
      break;
    }
    case 'nyssa': {
      const p = state.provinces[province!];
      p.order = clamp(p.order - T.nyssa.order, 0, 100);
      scribe(state, { kind: 'diplomacy', about: pid, text: `A whisper campaign ran through ${p.name}: three dinners, one funeral, and a rumor with excellent posture. Order fell by ${T.nyssa.order}, and ${lordName(state, p.owner)} cannot prove a thing.` });
      break;
    }
    case 'morrikan': {
      const barrows = mine.filter((p) => p.site === 'barrow');
      if (barrows.length === 0) return fail('The doors need barrows — rule at least one.');
      for (const p of barrows) {
        const existing = armiesIn(state, p.id).find((a) => a.owner === pid && a.units.length <= 10);
        if (existing) existing.units.push(...makeUnits('revenants', T.morrikan.companiesPerBarrow));
        else newArmy(state, pid, p.id, makeUnits('revenants', T.morrikan.companiesPerBarrow));
        p.order = clamp(p.order - T.morrikan.orderCost, 0, 100);
      }
      province = barrows[0].id;
      scribe(state, { kind: 'magic', about: pid, text: `${lordName(state, pid)} opened the doors, all of them at once. At ${barrows.length === 1 ? 'his barrow' : `${barrows.length} barrows`} the old dead formed ranks — his constituents, voting in columns. The living bolted their shutters (−${T.morrikan.orderCost} order there).` });
      break;
    }
    case 'vaelia': {
      player.mark = { target: targetPlayer!, turnsLeft: T.vaelia.seasons };
      scribe(state, { kind: 'war', about: pid, text: `The crows learned a new sigil: ${lordName(state, targetPlayer!)}'s. For ${T.vaelia.seasons} seasons, every battle ${lordName(state, pid)} wins against that banner is plundered threefold. The crows are quick studies.` });
      break;
    }
    default:
      return fail('This lord keeps no signature — which would itself be remarkable.');
  }

  player.signatureCooldownLeft = sig.cooldown;
  teach(state, pid, 'firstSignature');
  effects.push({ e: 'signature', by: pid, province, targetPlayer });
  void rng; // reserved: no signature rolls dice today, and none should quietly start
  void seenBy;
  return { ok: true, effects };
}

/** Own-turn-begin upkeep: cooldown and timed signature states tick down. */
export function tickSignatures(state: GameState, pid: PlayerId): void {
  const player = state.players[pid];
  if ((player.signatureCooldownLeft ?? 0) > 0) player.signatureCooldownLeft -= 1;
  if (player.crusade && --player.crusade.turnsLeft <= 0) player.crusade = null;
  if (player.mark && --player.mark.turnsLeft <= 0) player.mark = null;
  if (player.embargo && --player.embargo.turnsLeft <= 0) player.embargo = null;
}
