/**
 * Game initialization: settings -> a complete, ready GameState.
 * (The first turn's opening processing is applied by engine.createGame.)
 */
import { LORDS, LORD_BY_ID } from './content/lords';
import { makePersonName, makeTroubleName } from './content/names';
import { createHero, HERO_CLASSES } from './heroes';
import { makeUnits, newArmy } from './helpers';
import { refreshRiteOffers } from './magic';
import { refreshQuestOffers } from './quests';
import { generateMap, pickSeats } from './mapgen';
import { say } from './narrator';
import { teach } from './teachings';
import { Rng, rngStateFrom } from './rng';
import type {
  CourtOffer, Difficulty, GameSettings, GameState, HeroClass, Player, PlayerHandicap, PlayerSetup, UnitInstance,
} from './types';
import { NEUTRAL } from './types';

/** Bumped on every change to engine semantics that alters the RNG stream or
 * action behavior. Saves from older versions still load and play forward
 * correctly (rng state lives in the save), but their action logs are only
 * guaranteed to replay byte-identically under the version that wrote them.
 * v1: launch rules. v2: lordSpeech chronicle entries (iteration 2).
 * v3: coalitions, joinWar, defensive alliances, combined assaults,
 *     emberlight fervor (iteration 3). */
export const RULES_VERSION = 3;

export const HANDICAPS: Record<Difficulty, PlayerHandicap> = {
  squire: { incomeMult: 0.85, label: 'Squire — AI earns 15% less gold and attacks only with clear advantage.' },
  knight: { incomeMult: 1.0, label: 'Knight — AI plays with even hands. No bonuses either way.' },
  warlord: { incomeMult: 1.25, label: 'Warlord — AI earns +25% gold and presses attacks harder.' },
};

export const START_GOLD = 260;
export const START_EMBERLIGHT = 6;

export function defaultSettings(): GameSettings {
  return {
    seed: '',
    mapSize: 'medium',
    players: [
      { kind: 'human', lordId: 'random', difficulty: 'knight' },
      { kind: 'ai', lordId: 'random', difficulty: 'knight' },
      { kind: 'ai', lordId: 'random', difficulty: 'knight' },
      { kind: 'ai', lordId: 'random', difficulty: 'knight' },
    ],
    victoryPaths: ['conquest', 'dominion', 'goldenAge', 'legend'],
    maxTurns: 60,
    fogOfWar: false,
    veteranChronicle: false,
  };
}

function resolveLords(rng: Rng, setups: PlayerSetup[]): string[] {
  const taken = new Set(setups.map((s) => s.lordId).filter((id) => id !== 'random'));
  return setups.map((s) => {
    if (s.lordId !== 'random') return s.lordId;
    const free = LORDS.filter((l) => !taken.has(l.id));
    const pick = rng.pick(free);
    taken.add(pick.id);
    return pick.id;
  });
}

function startingHeroClass(rng: Rng, lordId: string): HeroClass {
  const lord = LORD_BY_ID[lordId];
  const p = lord.personality;
  return rng.pickWeighted(['champion', 'magus', 'warden', 'shade'] as const, (cls) => {
    if (cls === 'champion') return 1 + p.aggression * 2;
    if (cls === 'magus') return 0.4 + p.mysticism * 2.2;
    if (cls === 'warden') return 0.8 + (lord.favoredTerrain === 'forest' || lord.favoredTerrain === 'hills' ? 1.2 : 0.4);
    return 0.3 + (lord.creed === 'umbra' ? 1.6 : 0.2) + p.greed * 0.5;
  });
}

export function makeCourtOffer(rng: Rng, turn: number, preferred?: HeroClass): CourtOffer {
  const cls: HeroClass = preferred ?? rng.pick(['champion', 'magus', 'warden', 'shade'] as const);
  const def = HERO_CLASSES[cls];
  const level = rng.chance(0.22) ? 2 : 1;
  const { name, epithet } = makePersonName(rng, cls);
  const jitter = (n: number) => Math.max(0, n + (rng.chance(0.4) ? rng.intRange(-1, 1) : 0));
  return {
    name,
    epithet,
    cls,
    level,
    cost: Math.round(def.hireCost * (level === 2 ? 1.5 : 1) * rng.range(0.9, 1.12)),
    expiresTurn: turn + rng.intRange(3, 5),
    might: jitter(def.base.might + (level - 1)),
    lore: jitter(def.base.lore + (level - 1)),
    guile: jitter(def.base.guile + (level - 1)),
    leadership: jitter(def.base.leadership),
  };
}

/** Build the full initial state. Deterministic for (settings.seed, settings). */
export function initGame(settings: GameSettings): GameState {
  const seed = settings.seed.trim() || 'the-sundered-age';
  const rngState = rngStateFrom(seed);
  const rng = new Rng(rngState);
  const map = generateMap(rng, settings.mapSize);

  // Lords resolve on a separate stream: replays carry already-resolved ids,
  // and the main stream must not depend on whether they were 'random'.
  const lordIds = resolveLords(new Rng(`${seed}::lords`), settings.players);
  const seats = pickSeats(rng, map.provinces, settings.players.length);

  const state: GameState = {
    v: RULES_VERSION,
    seed,
    rng: rngState,
    turn: 1,
    phase: 'playing',
    settings: { ...settings, seed, players: settings.players.map((p, i) => ({ ...p, lordId: lordIds[i] })) },
    mapW: map.w,
    mapH: map.h,
    cells: map.cells,
    provinces: map.provinces,
    players: [],
    current: 0,
    armies: {},
    nextArmyId: 1,
    heroes: {},
    nextHeroId: 1,
    artifacts: {},
    nextArtifactId: 1,
    deeds: {},
    stances: {},
    proposals: [],
    nextProposalId: 1,
    questOffers: {},
    activeQuests: [],
    pendingEvents: [],
    nextEventId: 1,
    chronicle: [],
    battles: [],
    nextBattleId: 1,
    stats: [],
    victory: {
      paths: [...settings.victoryPaths],
      maxTurns: settings.maxTurns,
      winner: null,
      winPath: null,
      dominionStreak: {},
      goldenStreak: {},
      coalitionTurn: null,
    },
    log: [],
    flags: {},
    narratorUsed: {},
    leaderSince: null,
    leaderRounds: 0,
  };

  // -- players
  settings.players.forEach((setup, i) => {
    const lord = LORD_BY_ID[lordIds[i]];
    const difficulty: Difficulty = setup.kind === 'ai' ? setup.difficulty : 'knight';
    const player: Player = {
      id: i,
      lordId: lord.id,
      kind: setup.kind,
      ...(setup.kind === 'ai' ? { difficulty } : {}),
      alive: true,
      gold: START_GOLD,
      emberlight: START_EMBERLIGHT,
      tax: 'fair',
      spells: lord.perk.fx.startingSpell ? [lord.perk.fx.startingSpell] : [],
      spellCooldowns: {},
      rite: null,
      riteOffers: [],
      seatProvince: seats[i],
      vault: [],
      handicap: setup.kind === 'ai' ? HANDICAPS[difficulty] : { incomeMult: 1, label: 'None — mortal hands.' },
      sagaChapter: 0,
      courtOffers: [],
      seen: [],
      flags: {},
    };
    state.players.push(player);

    // seat province
    const seat = state.provinces[seats[i]];
    seat.owner = i;
    seat.seatOf = i;
    seat.order = 68;
    seat.prosperity = 1.05;
    seat.buildings = ['walls1', 'barracks'];
    seat.folk = lord.creed;

    // starting force + hero
    const units: UnitInstance[] = [...makeUnits('spears', 2), ...makeUnits('archers', 1), ...makeUnits('militia', 1)];
    const army = newArmy(state, i, seat.id, units);
    const heroCls = startingHeroClass(rng, lord.id);
    const hero = createHero(state, rng, i, heroCls, 2, seat.id);
    hero.armyId = army.id;
    army.heroIds.push(hero.id);

    // court
    player.courtOffers = [
      makeCourtOffer(rng, 1),
      makeCourtOffer(rng, 1, heroCls === 'magus' ? 'champion' : 'magus'),
    ];
  });

  // -- neutral garrisons (free provinces defend themselves)
  for (const p of state.provinces) {
    if (p.owner !== NEUTRAL) continue;
    const rich = p.terrain === 'meadow' || (p.coastal && p.terrain !== 'mountain');
    const units: UnitInstance[] = [
      ...makeUnits('militia', rng.intRange(1, 2)),
      ...makeUnits('spears', rich ? rng.intRange(1, 2) : rng.intRange(0, 1)),
      ...(rng.chance(0.4) ? makeUnits('archers', 1) : []),
    ];
    newArmy(state, NEUTRAL, p.id, units, { stance: 'bold' });
    // old places keep old guardians
    if (p.site === 'barrow' && rng.chance(0.75)) {
      newArmy(state, NEUTRAL, p.id, makeUnits('revenants', rng.intRange(1, 2)), { stance: 'bold', kind: 'revenants' });
    } else if ((p.site === 'ruin' || p.site === 'forge') && rng.chance(0.6)) {
      newArmy(state, NEUTRAL, p.id, makeUnits('marauders', rng.intRange(1, 2)), { stance: 'bold', kind: 'marauders' });
    }
  }

  // -- visibility
  for (const player of state.players) {
    if (!settings.fogOfWar) {
      player.seen = state.provinces.map((p) => p.id);
    } else {
      const seat = state.provinces[player.seatProvince];
      player.seen = [seat.id, ...seat.neighbors];
    }
  }

  // -- first workings and undertakings on every board
  for (const player of state.players) {
    refreshRiteOffers(state, rng, player.id);
    refreshQuestOffers(state, rng, player.id);
    if (player.spells.length > 0) teach(state, player.id, 'firstSpellKnown');
  }

  // -- opening entry
  const lordList = state.players
    .map((pl) => {
      const l = LORD_BY_ID[pl.lordId];
      return `${l.name}, ${l.epithet}`;
    })
    .join('; ');
  say(state, rng, 'opening', { realmAge: 40, lords: lordList, count: state.players.length });

  return state;
}

// keep makeTroubleName imported for rebellion use downstream
export { makeTroubleName };
