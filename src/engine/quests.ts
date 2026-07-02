/**
 * Quests: offers on the board, heroes in the field, outcomes in the
 * chronicle. Includes the Grand Saga — the Legend victory path.
 */
import { ARTIFACTS, QUEST_ARTIFACTS } from './content/artifacts';
import { GENERIC_QUESTS, QUESTS, SAGA_QUESTS, TIER_DEATH_RISK, type QuestDef } from './content/quests';
import { RITE_LEARNABLE, SPELLS } from './content/spells';
import { heroDies } from './combat';
import { heroDerived } from './heroFx';
import { addDeed as heroDeed, grantXp, woundHero } from './heroes';
import {
  artifactDefIdsInPlay, clamp, grantArtifactTo, heroProvince, heroesOf, lordName, lordOf, provincesOf,
} from './helpers';
import { say, scribe } from './narrator';
import type { Rng } from './rng';
import type { ActiveQuest, Effect, GameState, Hero, PlayerId } from './types';

// ------------------------------------------------------------------ offers

/** Provinces where a quest def could run for this player. */
function questVenues(state: GameState, pid: PlayerId, def: QuestDef): number[] {
  if (def.site === 'ownSeat') {
    const seat = state.provinces[state.players[pid].seatProvince];
    return seat.owner === pid ? [seat.id] : [];
  }
  const reachable = new Set<number>();
  for (const p of provincesOf(state, pid)) {
    reachable.add(p.id);
    for (const n of p.neighbors) reachable.add(n);
  }
  if (def.site === null) {
    return provincesOf(state, pid).map((p) => p.id);
  }
  // saga site quests may lie anywhere in the realm — the journey is the story
  const anywhere = def.saga !== undefined;
  return state.provinces
    .filter((p) => p.site === def.site && (anywhere || reachable.has(p.id)))
    .map((p) => p.id);
}

export function refreshQuestOffers(state: GameState, rng: Rng, pid: PlayerId): void {
  const offers = (state.questOffers[pid] ?? []).filter((o) => o.expiresTurn >= state.turn);
  const have = new Set(offers.map((o) => o.defId));
  const active = new Set(state.activeQuests.filter((q) => q.owner === pid).map((q) => q.defId));
  while (offers.length < 3) {
    const candidates = GENERIC_QUESTS.filter((id) => !have.has(id) && !active.has(id));
    if (candidates.length === 0) break;
    const defId = rng.pickWeighted(candidates, (id) => {
      const def = QUESTS[id];
      const venues = questVenues(state, pid, def);
      if (venues.length === 0) return 0;
      return def.tier === 1 ? 3 : def.tier === 2 ? 2.2 : 1.2;
    });
    const def = QUESTS[defId];
    const venues = questVenues(state, pid, def);
    if (venues.length === 0) {
      have.add(defId); // don't reconsider this refresh
      continue;
    }
    offers.push({
      defId,
      province: rng.pick(venues),
      expiresTurn: state.turn + rng.intRange(3, 5),
    });
    have.add(defId);
  }
  state.questOffers[pid] = offers;
}

/** The next saga chapter available to this player, with its venue(s). */
export function sagaAvailable(state: GameState, pid: PlayerId): { def: QuestDef; venues: number[] } | null {
  const player = state.players[pid];
  if (player.sagaChapter >= 5) return null;
  const nextId = SAGA_QUESTS[player.sagaChapter];
  const def = QUESTS[nextId];
  // chapter 4 needs both shards in this realm's possession
  if (def.saga === 4 && !hasBothShards(state, pid)) return null;
  const venues = questVenues(state, pid, def);
  return venues.length > 0 ? { def, venues } : null;
}

export function hasBothShards(state: GameState, pid: PlayerId): boolean {
  const owned = new Set<string>();
  for (const artId of state.players[pid].vault) {
    const inst = state.artifacts[artId];
    if (inst) owned.add(inst.defId);
  }
  for (const hero of heroesOf(state, pid)) {
    for (const slot of ['weapon', 'armor', 'trinket'] as const) {
      const artId = hero.artifacts[slot];
      if (artId !== null) {
        const inst = state.artifacts[artId];
        if (inst) owned.add(inst.defId);
      }
    }
  }
  return owned.has('shardOfMorning') && owned.has('shardOfNoon');
}

function heroHasEmberheart(state: GameState, hero: Hero): boolean {
  for (const slot of ['weapon', 'armor', 'trinket'] as const) {
    const artId = hero.artifacts[slot];
    if (artId !== null && state.artifacts[artId]?.defId === 'emberheart') return true;
  }
  return false;
}

// ------------------------------------------------------------------ start

export function startQuest(
  state: GameState,
  rng: Rng,
  pid: PlayerId,
  heroId: number,
  defId: string,
  provinceId: number,
  effects: Effect[],
): { ok: boolean; error?: string } {
  const hero = state.heroes[heroId];
  const def = QUESTS[defId];
  if (!hero || hero.owner !== pid || hero.status === 'dead') return { ok: false, error: 'No such hero in your service.' };
  if (hero.status !== 'ready') return { ok: false, error: 'The hero is not at liberty.' };
  if (!def) return { ok: false, error: 'No such undertaking.' };
  if (def.minLevel && hero.level < def.minLevel) return { ok: false, error: `Needs a hero of level ${def.minLevel}.` };

  if (def.saga !== undefined) {
    const avail = sagaAvailable(state, pid);
    if (!avail || avail.def.id !== defId) return { ok: false, error: 'The Saga does not open that page yet.' };
    if (!avail.venues.includes(provinceId)) return { ok: false, error: 'The Saga does not lead there.' };
    if (def.saga === 5 && !heroHasEmberheart(state, hero)) {
      return { ok: false, error: 'The Rekindling needs the Emberheart in the questing hero\'s keeping.' };
    }
  } else {
    const offer = (state.questOffers[pid] ?? []).find((o) => o.defId === defId && o.province === provinceId);
    if (!offer) return { ok: false, error: 'That undertaking is no longer offered.' };
  }

  // detach from any army; the road is theirs alone
  if (hero.armyId !== null) {
    const army = state.armies[hero.armyId];
    if (army) army.heroIds = army.heroIds.filter((h) => h !== hero.id);
    hero.armyId = null;
  }
  hero.status = 'questing';
  hero.questId = defId;
  hero.province = provinceId;
  state.activeQuests.push({
    defId,
    heroId,
    owner: pid,
    province: provinceId,
    startTurn: state.turn,
    endTurn: state.turn + def.duration,
  });
  state.questOffers[pid] = (state.questOffers[pid] ?? []).filter((o) => !(o.defId === defId && o.province === provinceId));

  if (def.saga === 5) {
    say(state, rng, 'sagaRitual', {
      lord: lordName(state, pid),
      hero: hero.name,
      seat: state.provinces[provinceId].name,
    }, { about: pid });
  } else {
    scribe(state, {
      kind: 'hero',
      about: pid,
      text: `${hero.name}, ${hero.epithet}, rode out on ${lordName(state, pid)}'s behalf: ${def.name.toLowerCase().startsWith('saga') ? def.name : `“${def.name}”`}, at ${state.provinces[provinceId].name}. ${def.duration} ${def.duration === 1 ? 'season' : 'seasons'}, if the road keeps its promises.`,
    });
  }
  effects.push({ e: 'chronicle', entry: state.chronicle[state.chronicle.length - 1] });
  return { ok: true };
}

// ----------------------------------------------------------------- resolve

export function tickQuests(state: GameState, rng: Rng, pid: PlayerId, effects: Effect[]): void {
  const due = state.activeQuests.filter((q) => q.owner === pid && q.endTurn <= state.turn);
  for (const quest of due) {
    state.activeQuests = state.activeQuests.filter((q) => q !== quest);
    resolveQuest(state, rng, quest, effects);
  }
}

function resolveQuest(state: GameState, rng: Rng, quest: ActiveQuest, effects: Effect[]): void {
  const hero = state.heroes[quest.heroId];
  const def = QUESTS[quest.defId];
  if (!hero || hero.status === 'dead') return;
  const pid = quest.owner;
  const player = state.players[pid];
  const derived = heroDerived(state, hero);

  let roll = derived[def.stat] + hero.level * 0.5 + derived.questAdd + rng.intRange(1, 8);
  if (def.stat === 'guile') roll += lordOf(player).perk.fx.questGuileAdd ?? 0;
  const margin = roll - def.dc;
  const outcome: 'triumph' | 'success' | 'setback' | 'disaster' =
    margin >= 4 ? 'triumph' : margin >= 0 ? 'success' : margin >= -3 ? 'setback' : 'disaster';
  const won = outcome === 'triumph' || outcome === 'success';

  // ---- rewards
  const summaryBits: string[] = [];
  if (won) {
    const mult = outcome === 'triumph' ? 1.5 : 1;
    if (def.rewards.gold) {
      const gold = Math.round(rng.intRange(def.rewards.gold[0], def.rewards.gold[1]) * mult);
      player.gold += gold;
      summaryBits.push(`+${gold} gold`);
    }
    if (def.rewards.emberlight) {
      const el = Math.round(def.rewards.emberlight * mult);
      player.emberlight = Math.min(999, player.emberlight + el);
      summaryBits.push(`+${el} Emberlight`);
    }
    if (def.rewards.order) {
      const p = state.provinces[quest.province];
      if (p.owner === pid) {
        p.order = clamp(p.order + Math.round(def.rewards.order * mult), 0, 100);
        summaryBits.push(`+${Math.round(def.rewards.order * mult)} order at ${p.name}`);
      }
    }
    if (def.rewards.artifactChance && rng.chance(Math.min(1, def.rewards.artifactChance + (outcome === 'triumph' ? 0.25 : 0)))) {
      const taken = artifactDefIdsInPlay(state);
      const pool = QUEST_ARTIFACTS.filter((id) => !taken.has(id));
      if (pool.length > 0) {
        // ancient forges yield weapons; elsewhere, fate decides
        const site = state.provinces[quest.province].site;
        const defId = rng.pickWeighted(pool, (id) =>
          site === 'forge' && ARTIFACTS[id].slot === 'weapon' ? 3 : 1,
        );
        const artId = grantArtifactTo(state, pid, defId);
        effects.push({ e: 'artifactFound', artifactId: artId, by: pid });
        say(state, rng, 'artifactFound', {
          lord: lordName(state, pid),
          artifact: ARTIFACTS[defId].name,
          how: `brought out of ${state.provinces[quest.province].name} by ${hero.name}`,
        }, { about: pid });
        summaryBits.push(ARTIFACTS[defId].name);
      }
    }
    if (def.rewards.spell) {
      const known = new Set(player.spells);
      const pool = RITE_LEARNABLE.filter((id) => !known.has(id));
      if (pool.length > 0) {
        const spellId = rng.pick(pool);
        player.spells.push(spellId);
        summaryBits.push(`the working “${SPELLS[spellId].name}”`);
      }
    }
    if (def.rewards.grantArtifact) {
      // saga forge consumes the shards it reforges
      if (def.saga === 4) {
        consumeShards(state, pid, ['shardOfMorning', 'shardOfNoon']);
      }
      const artId = grantArtifactTo(state, pid, def.rewards.grantArtifact);
      effects.push({ e: 'artifactFound', artifactId: artId, by: pid });
      summaryBits.push(ARTIFACTS[def.rewards.grantArtifact].name);
    }
  }

  // ---- xp always, weighted by outcome
  const xpMult = outcome === 'triumph' ? 1.3 : outcome === 'success' ? 1 : outcome === 'setback' ? 0.5 : 0.35;
  const gained = grantXp(hero, rng, def.rewards.xp * xpMult * derived.xpMult);
  if (gained > 0) effects.push({ e: 'heroLevel', heroId: hero.id, level: hero.level });

  // ---- risks
  hero.questId = null;
  hero.status = 'ready';
  if (outcome === 'setback') {
    woundHero(hero, rng.intRange(1, 2));
  } else if (outcome === 'disaster') {
    const deathRisk = Math.max(0.05, TIER_DEATH_RISK[def.tier] - derived.deathSave);
    if (rng.chance(deathRisk)) {
      heroDies(state, rng, hero, `on the quest “${def.name}”`, effects);
    } else {
      woundHero(hero, rng.intRange(2, 4));
    }
  }

  // ---- saga progression
  if (won && def.saga !== undefined) {
    player.sagaChapter = def.saga;
    if (def.saga < 5) {
      say(state, rng, 'sagaAdvance', {
        lord: lordName(state, pid),
        hero: hero.name,
        chapter: def.saga,
        chapterName: def.name,
      }, { about: pid });
    }
    // chapter 5 victory is caught by checkVictory at round end (and UI banner immediately)
  }

  // ---- the chronicle tells it
  const died = (state.heroes[hero.id]?.status ?? 'dead') === 'dead';
  const seatName = state.provinces[state.players[pid].seatProvince].name;
  const text = def.outcomes[outcome]
    .replaceAll('{hero}', died ? `${hero.name} (now of blessed memory)` : hero.name)
    .replaceAll('{seat}', seatName);
  const suffix = summaryBits.length > 0 ? ` (${summaryBits.join(', ')})` : '';
  scribe(state, { kind: 'hero', about: pid, text: text + suffix, ...(def.saga === 5 && won ? { ceremony: true } : {}) });
  if (!died) {
    heroDeed(hero, won ? `${def.name}: done` : `${def.name}: repelled`);
  }
  effects.push({
    e: 'questDone',
    heroId: hero.id,
    questDefId: def.id,
    outcome,
    summary: text,
  });
}

function consumeShards(state: GameState, pid: PlayerId, defIds: string[]): void {
  for (const defId of defIds) {
    const inst = Object.values(state.artifacts).find((a) => a.defId === defId);
    if (!inst) continue;
    const player = state.players[pid];
    player.vault = player.vault.filter((id) => id !== inst.id);
    for (const hero of heroesOf(state, pid)) {
      for (const slot of ['weapon', 'armor', 'trinket'] as const) {
        if (hero.artifacts[slot] === inst.id) hero.artifacts[slot] = null;
      }
    }
    delete state.artifacts[inst.id];
  }
}
