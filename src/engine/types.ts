/**
 * The complete shape of a game of Realms in Embers.
 *
 * GameState is ONE plain JSON-serializable object. No classes, Maps, Sets,
 * Dates or functions inside. Content definitions (lords, units, spells…) live
 * in src/engine/content and are referenced from state by string id.
 */

// ---------------------------------------------------------------- identities

export type ProvinceId = number;
/** Index into GameState.players. -1 is the NEUTRAL "player" (rebels, monsters, free provinces). */
export type PlayerId = number;
export const NEUTRAL: PlayerId = -1;

export type Creed = 'flame' | 'ash' | 'umbra';
export type Terrain = 'meadow' | 'forest' | 'hills' | 'mountain' | 'moor';
export type SiteType = 'embersite' | 'ruin' | 'shrine' | 'barrow' | 'forge' | 'circle';

export type BuildingId =
  | 'farm' | 'market' | 'harbor' | 'roads'
  | 'walls1' | 'walls2' | 'walls3'
  | 'temple' | 'mageTower' | 'barracks' | 'warcamp';

export type UnitTypeId =
  | 'militia' | 'spears' | 'archers' | 'riders' | 'knights'
  | 'wardens' | 'cragguard' | 'adepts' | 'siegeworks' | 'ashwings'
  | 'sunblades' | 'barrowguard' | 'shadecloaks'
  | 'rebels' | 'marauders' | 'revenants';

export type HeroClass = 'champion' | 'magus' | 'warden' | 'shade';

export type SpellId =
  // battle
  | 'cinderbolt' | 'shieldOfAsh' | 'panicWhisper' | 'emberVeil' | 'rousingFlame' | 'graspingMire'
  | 'sunlance' | 'gloomCall'
  // realm
  | 'scryingSmoke' | 'blessHarvest' | 'sowDiscord' | 'wardOfEmbers' | 'beaconMarch'
  | 'barrowCall' | 'seersFlame' | 'quenchling' | 'emberTithe' | 'veilOfNight';

export type Stance = 'bold' | 'measured' | 'wary';
export type TaxLevel = 'light' | 'fair' | 'harsh';
export type Difficulty = 'squire' | 'knight' | 'warlord';
export type DiploStance = 'war' | 'peace' | 'pact' | 'alliance';
export type VictoryPath = 'conquest' | 'dominion' | 'goldenAge' | 'legend';

// ------------------------------------------------------------------- pieces

export interface UnitInstance {
  type: UnitTypeId;
  /** Remaining hits; company is destroyed at 0. Max comes from the unit def. */
  hits: number;
  /** Veterancy: 0 green, 1 seasoned, 2 veteran. */
  vet: 0 | 1 | 2;
}

export interface Army {
  id: number;
  owner: PlayerId;
  province: ProvinceId;
  units: UnitInstance[];
  heroIds: number[];
  /** Movement spent this turn. */
  moved: boolean;
  stance: Stance;
  /** Marks neutral lairs/rebel bands so the UI and AI can tell them apart. */
  kind?: 'rebels' | 'marauders' | 'revenants';
}

export interface HeroArtifactSlots {
  weapon: number | null;
  armor: number | null;
  trinket: number | null;
}

export interface Hero {
  id: number;
  owner: PlayerId;
  name: string;
  epithet: string;
  cls: HeroClass;
  level: number;
  xp: number;
  /** Core stats. might: battle; lore: magic; guile: quests/intrigue; leadership: army bonus. */
  might: number;
  lore: number;
  guile: number;
  leadership: number;
  status: 'ready' | 'questing' | 'wounded' | 'dead';
  /** Turns until a wounded hero recovers. */
  woundedTurns: number;
  /** Province where the hero currently is (their court if unattached). */
  province: ProvinceId;
  armyId: number | null;
  artifacts: HeroArtifactSlots;
  skills: string[];
  /** Spells this hero personally knows (magus mostly). */
  spells: SpellId[];
  /** Chronicle fodder: short deed strings, newest last. */
  deeds: string[];
  questId: string | null;
  /** Pending level-up choices (skill ids) the owner must pick from; empty = none. */
  levelChoices: string[];
  diedTurn?: number;
  deathCause?: string;
}

export interface ArtifactInstance {
  id: number;
  defId: string;
  foundTurn: number;
  /** Who has held it — lord names, for the saga. */
  history: string[];
}

export interface Province {
  id: ProvinceId;
  name: string;
  flavor: string;
  terrain: Terrain;
  coastal: boolean;
  site: SiteType | null;
  /** Folk creed of the population — mismatch with the owner costs order. */
  folk: Creed;
  /** Centroid in cell coordinates (for UI + distance math). */
  cx: number;
  cy: number;
  cells: number;
  neighbors: ProvinceId[];
  /** Neighbor ids reached across a river (defense bonus when attacked over it). */
  riverBorders: ProvinceId[];
  /** Coastal provinces reachable by sea (needs harbor to use). */
  seaLinks: ProvinceId[];
  owner: PlayerId;
  /** Public order 0..100. */
  order: number;
  /** Long-term wealth multiplier, drifts with order. */
  prosperity: number;
  buildings: BuildingId[];
  buildQueue: { id: BuildingId; turnsLeft: number } | null;
  recruitQueue: { unit: UnitTypeId; turnsLeft: number } | null;
  /** Seat (capital) of which player, if any. */
  seatOf: PlayerId | null;
  /** Turn this province last changed hands (for "recently conquered" unrest). */
  capturedTurn: number;
}

// -------------------------------------------------------------------- magic

export interface RiteState {
  spellId: SpellId;
  paid: number;
  cost: number;
}

// ---------------------------------------------------------------- diplomacy

export interface DiploDeed {
  id: string;
  label: string;
  delta: number;
  turn: number;
  /** Amount the delta moves toward 0 each round. */
  decay: number;
}

export interface DiploProposal {
  id: number;
  from: PlayerId;
  to: PlayerId;
  kind: 'peace' | 'pact' | 'alliance' | 'gift' | 'demand' | 'joinWar';
  /** Gold attached (gift/demand/peace sweetener). */
  gold: number;
  /** For joinWar: the target player. */
  target?: PlayerId;
  turn: number;
  /** Short in-fiction message shown to the recipient. */
  note: string;
}

// ------------------------------------------------------------------- quests

export interface ActiveQuest {
  defId: string;
  heroId: number;
  owner: PlayerId;
  province: ProvinceId;
  startTurn: number;
  endTurn: number;
}

export interface QuestOffer {
  defId: string;
  province: ProvinceId;
  /** Offers rotate; gone after this turn. */
  expiresTurn: number;
}

// ------------------------------------------------------------------- events

export interface EventInstance {
  id: number;
  defId: string;
  player: PlayerId;
  province: ProvinceId | null;
  heroId: number | null;
  turn: number;
  /** Filled when resolved. */
  choiceIdx?: number;
}

// ------------------------------------------------------------------ battles

export interface BattleSideSummary {
  player: PlayerId;
  strength: number;
  units: { type: UnitTypeId; count: number; lost: number }[];
  heroNames: string[];
}

export interface BattleRound {
  aPower: number;
  dPower: number;
  aLoss: number;
  dLoss: number;
  notes: string[];
}

export interface BattleEventNote {
  kind: 'heroWound' | 'heroDeath' | 'spell' | 'wallsBreached' | 'withdraw' | 'rout' | 'lastStand' | 'duel';
  text: string;
}

export interface BattleReport {
  id: number;
  turn: number;
  province: ProvinceId;
  provinceName: string;
  attacker: BattleSideSummary;
  defender: BattleSideSummary;
  rounds: BattleRound[];
  events: BattleEventNote[];
  winner: 'attacker' | 'defender';
  captured: boolean;
  /** Modifier breakdowns shown in the preview and the report. */
  aMods: OddsModifier[];
  dMods: OddsModifier[];
}

export interface OddsModifier {
  label: string;
  /** Multiplier, e.g. 1.25; or additive percentage in display. */
  mult: number;
}

export interface BattlePreview {
  winChance: number;
  aStrength: number;
  dStrength: number;
  aExpectedLoss: number;
  dExpectedLoss: number;
  aMods: OddsModifier[];
  dMods: OddsModifier[];
  /** Plain-language warnings: walls unbreached, river crossing, hero risk… */
  notes: string[];
}

// ---------------------------------------------------------------- chronicle

export type ChronicleKind =
  | 'war' | 'hero' | 'magic' | 'realm' | 'diplomacy' | 'event' | 'teaching' | 'ceremony' | 'turn';

export interface ChronicleEntry {
  turn: number;
  kind: ChronicleKind;
  text: string;
  /** Player the entry chiefly concerns (for filtering + hotseat privacy). */
  about: PlayerId | null;
  /** Only visible to this player (scry results, private counsel). */
  privateTo?: PlayerId;
  /** Big-moment entries get ceremony treatment in the UI. */
  ceremony?: boolean;
}

// ------------------------------------------------------------------ players

export interface PlayerHandicap {
  incomeMult: number;
  /** Visible description, e.g. "+25% income, bolder attacks". */
  label: string;
}

export interface Player {
  id: PlayerId;
  lordId: string;
  kind: 'human' | 'ai';
  /** AI difficulty (transparent handicaps). Humans: undefined. */
  difficulty?: Difficulty;
  alive: boolean;
  eliminatedTurn?: number;
  gold: number;
  emberlight: number;
  tax: TaxLevel;
  spells: SpellId[];
  spellCooldowns: Partial<Record<SpellId, number>>;
  rite: RiteState | null;
  riteOffers: SpellId[];
  seatProvince: ProvinceId;
  /** Artifact instance ids not equipped by any hero. */
  vault: number[];
  handicap: PlayerHandicap;
  /** Grand Saga chapter completed (0..5). 5 = Legend victory. */
  sagaChapter: number;
  /** Hero hire offers currently at court. */
  courtOffers: CourtOffer[];
  /** Province ids ever seen (fog of war). Always full when fog is off. */
  seen: ProvinceId[];
  /** Persistent bag of one-time flags (teaching, event chains). */
  flags: Record<string, boolean>;
}

export interface CourtOffer {
  name: string;
  epithet: string;
  cls: HeroClass;
  level: number;
  cost: number;
  expiresTurn: number;
  /** Stat block preview. */
  might: number;
  lore: number;
  guile: number;
  leadership: number;
}

// ------------------------------------------------------------------ setup

export interface PlayerSetup {
  kind: 'human' | 'ai';
  /** Content lord id, or 'random'. */
  lordId: string;
  difficulty: Difficulty;
  name?: string;
}

export type MapSize = 'small' | 'medium' | 'large';

export interface GameSettings {
  seed: string;
  mapSize: MapSize;
  players: PlayerSetup[];
  victoryPaths: VictoryPath[];
  /** Round cap; the Chronicle closes and the realm is scored. */
  maxTurns: number;
  fogOfWar: boolean;
  /** Suppress Osperan's teaching marginalia. */
  veteranChronicle: boolean;
}

// ------------------------------------------------------------------ actions

export type Action =
  | { t: 'endTurn' }
  | { t: 'setTax'; level: TaxLevel }
  | { t: 'build'; province: ProvinceId; building: BuildingId }
  | { t: 'recruit'; province: ProvinceId; unit: UnitTypeId }
  | { t: 'disband'; armyId: number; index: number }
  | { t: 'moveArmy'; armyId: number; to: ProvinceId; viaSea?: boolean }
  | { t: 'splitArmy'; armyId: number; unitIdx: number[]; heroIds: number[]; to: ProvinceId; viaSea?: boolean }
  | { t: 'mergeArmies'; from: number; into: number }
  | { t: 'setStance'; armyId: number; stance: Stance }
  | { t: 'hireHero'; offerIdx: number }
  | { t: 'dismissHero'; heroId: number }
  | { t: 'attachHero'; heroId: number; armyId: number | null }
  | { t: 'chooseSkill'; heroId: number; skill: string }
  | { t: 'equip'; heroId: number; artifactId: number; slot: keyof HeroArtifactSlots }
  | { t: 'unequip'; heroId: number; slot: keyof HeroArtifactSlots }
  | { t: 'startQuest'; heroId: number; questDefId: string; province: ProvinceId }
  | { t: 'startRite'; spellId: SpellId }
  | { t: 'pledgeEmberlight'; amount: number }
  | { t: 'castSpell'; spell: SpellId; province?: ProvinceId; targetPlayer?: PlayerId }
  | { t: 'diplomacy'; kind: 'declareWar' | 'offerPeace' | 'offerPact' | 'offerAlliance' | 'gift' | 'demand' | 'breakPact'; target: PlayerId; gold?: number }
  | { t: 'respond'; proposalId: number; accept: boolean }
  | { t: 'eventChoice'; eventId: number; choiceIdx: number }
  | { t: 'concede' };

export interface LoggedAction {
  player: PlayerId;
  turn: number;
  action: Action;
}

// ----------------------------------------------------------- engine effects

/** Things that happened during applyAction — the UI/narrator/audio feed. */
export type Effect =
  | { e: 'battle'; report: BattleReport }
  | { e: 'captured'; province: ProvinceId; by: PlayerId; from: PlayerId }
  | { e: 'heroDied'; heroId: number; name: string; cause: string; owner: PlayerId }
  | { e: 'heroLevel'; heroId: number; level: number }
  | { e: 'heroHired'; heroId: number }
  | { e: 'questDone'; heroId: number; questDefId: string; outcome: 'triumph' | 'success' | 'setback' | 'disaster'; summary: string }
  | { e: 'spellCast'; spell: SpellId; by: PlayerId; province: ProvinceId | null }
  | { e: 'riteComplete'; spell: SpellId; by: PlayerId }
  | { e: 'artifactFound'; artifactId: number; by: PlayerId }
  | { e: 'rebellion'; province: ProvinceId }
  | { e: 'eventFired'; eventId: number }
  | { e: 'diplo'; kind: string; from: PlayerId; to: PlayerId }
  | { e: 'proposal'; proposal: DiploProposal }
  | { e: 'eliminated'; player: PlayerId }
  | { e: 'victory'; player: PlayerId; path: VictoryPath | 'chronicle' }
  | { e: 'turnStart'; player: PlayerId; income: IncomeReport }
  | { e: 'roundEnd'; turn: number }
  | { e: 'chronicle'; entry: ChronicleEntry };

export interface IncomeReport {
  gold: number;
  upkeep: number;
  wages: number;
  net: number;
  emberlight: number;
  lines: { label: string; amount: number }[];
}

// ------------------------------------------------------------------- stats

export interface PlayerTurnStat {
  player: PlayerId;
  provinces: number;
  gold: number;
  income: number;
  armyPower: number;
  heroes: number;
  spellsKnown: number;
  order: number;
}

export interface TurnStats {
  turn: number;
  perPlayer: PlayerTurnStat[];
}

// ------------------------------------------------------------------- state

export interface VictoryState {
  paths: VictoryPath[];
  maxTurns: number;
  winner: PlayerId | null;
  winPath: VictoryPath | 'chronicle' | null;
  /** Consecutive rounds each player has held the dominion threshold. */
  dominionStreak: Record<number, number>;
  goldenStreak: Record<number, number>;
  /** Turn the coalition against the current leader fired (once). */
  coalitionTurn: number | null;
}

export interface GameState {
  v: number;
  seed: string;
  rng: number[];
  turn: number;
  phase: 'playing' | 'ended';
  settings: GameSettings;
  mapW: number;
  mapH: number;
  /** Province index per cell, -1 = sea. Row-major mapW × mapH. */
  cells: number[];
  provinces: Province[];
  players: Player[];
  /** Index of the player whose turn it is. */
  current: PlayerId;
  armies: Record<number, Army>;
  nextArmyId: number;
  heroes: Record<number, Hero>;
  nextHeroId: number;
  artifacts: Record<number, ArtifactInstance>;
  nextArtifactId: number;
  /** Directional diplomacy memory: key "a:b" = a's ledger about b. */
  deeds: Record<string, DiploDeed[]>;
  /** Symmetric stances: key "a:b" with a < b. */
  stances: Record<string, DiploStance>;
  proposals: DiploProposal[];
  nextProposalId: number;
  questOffers: Record<number, QuestOffer[]>;
  activeQuests: ActiveQuest[];
  /** Events awaiting a choice from their player. */
  pendingEvents: EventInstance[];
  nextEventId: number;
  chronicle: ChronicleEntry[];
  battles: BattleReport[];
  nextBattleId: number;
  stats: TurnStats[];
  victory: VictoryState;
  log: LoggedAction[];
  /** One-time global flags (world events, saga state). */
  flags: Record<string, boolean>;
  /** Narrator variety memory: line key -> turn last used. */
  narratorUsed: Record<string, number>;
  /** Rounds a player has been leader — drives visible strain/defiance. */
  leaderSince: PlayerId | null;
  leaderRounds: number;
}
