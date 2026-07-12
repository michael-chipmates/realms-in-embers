/**
 * The unit roster. Numbers are the balance surface: the sim harness
 * exercises them; tune here, nowhere else.
 */
import type { BuildingId, Creed, Terrain, UnitTypeId } from '../types';

export type UnitTrait =
  | 'ranged'      // strikes in the archery prelude before melee
  | 'charge'      // +20% attack in round 1 on open ground (meadow/hills), cancelled by 'brace'
  | 'brace'       // cancels enemy charge; +10% defense
  | 'armored'     // takes 15% fewer hits
  | 'siege'       // negates wall bonuses when attacking
  | 'forestborn'  // +25% strength in forest
  | 'mountainborn'// +25% strength in mountains
  | 'marshborn'   // +25% strength in moor
  | 'flying'      // ignores river penalty; +10% attack
  | 'caster'      // adds battle-magic weight; generates 1 Emberlight/turn
  | 'terror'      // enemy loses 8% strength unless they also field terror/unyielding
  | 'unyielding'  // immune to terror; never routs
  | 'ambush'      // +25% attack in round 1 when attacking
  | 'ragged';     // rabble: -10% defense (rebels, marauders)

/** The mechanical truth of every player-facing trait, for tooltips and the
 * Codex. MUST match the combat code: these lines are the player's contract.
 * ('ragged' is internal to neutral rabble; nothing a player raises has it.) */
export const TRAIT_INFO: Partial<Record<UnitTrait, string>> = {
  ranged: 'Strikes in the volley prelude, before the lines meet.',
  charge: '+20% attack in the first clash on open ground (Meadowlands or hills), cancelled if the enemy braces.',
  brace: '+10% strength when defending, and cancels enemy charges.',
  armored: 'Takes 15% fewer hits.',
  siege: 'Ignores the defenders’ wall bonus when attacking.',
  forestborn: '+25% strength when fighting in forest.',
  mountainborn: '+25% strength when fighting in the Crags.',
  marshborn: '+25% strength when fighting on the moors.',
  flying: '+10% attack, and rivers are no obstacle.',
  caster: 'Weaves battle-light (+4% army strength each, up to +12%) and kindles 1 Emberlight per season.',
  terror: 'The enemy fights at −8% unless they also field terror, the unyielding, or an immune lord.',
  unyielding: 'Immune to terror, and holds when every other company would break.',
  ambush: '+25% attack in the first clash when attacking.',
  ragged: 'Rabble in stolen boots: fights at −10%.',
};

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  namePlural: string;
  tier: 1 | 2 | 3;
  atk: number;
  def: number;
  hits: number;
  cost: number;
  upkeep: number;
  traits: UnitTrait[];
  /** Recruitment gates: all listed must hold. Neutral-only units have recruit: null.
   * (Revenants carry extra gates in code: Morrikan's perk, and a barrow site.) */
  recruit: {
    building?: BuildingId;
    terrain?: Terrain[];
    creed?: Creed;
  } | null;
  icon: string;
  desc: string;
  flavor: string;
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  militia: {
    id: 'militia', name: 'Militia Levy', namePlural: 'Militia Levies', tier: 1,
    atk: 2, def: 3, hits: 3, cost: 30, upkeep: 1, traits: [],
    recruit: {},
    icon: 'pitchfork',
    desc: 'Cheap and expendable. Anywhere, no buildings needed.',
    flavor: 'Farmhands with spears and strong opinions about being elsewhere.',
  },
  spears: {
    id: 'spears', name: 'Spearguard', namePlural: 'Spearguard', tier: 1,
    atk: 3, def: 5, hits: 4, cost: 55, upkeep: 2, traits: ['brace'],
    recruit: {},
    icon: 'spear',
    desc: 'Steady line infantry. Braces against cavalry charges; +10% defense.',
    flavor: 'The wall that walks. Knights write poems about them; short, annoyed poems.',
  },
  archers: {
    id: 'archers', name: 'Longbow Company', namePlural: 'Longbow Companies', tier: 1,
    atk: 4, def: 2, hits: 3, cost: 60, upkeep: 2, traits: ['ranged'],
    recruit: {},
    icon: 'bow',
    desc: 'Looses a volley before melee begins. Fragile once the lines close.',
    flavor: 'Argue with a longbow from wherever you like, so long as it is more than two hundred paces away.',
  },
  riders: {
    id: 'riders', name: 'Outriders', namePlural: 'Outriders', tier: 1,
    atk: 5, def: 3, hits: 4, cost: 90, upkeep: 3, traits: ['charge'],
    recruit: { terrain: ['meadow', 'hills'] },
    icon: 'horse',
    desc: 'Fast horse. +20% attack in the first clash on open ground. Raised in meadows and hills.',
    flavor: 'They arrive before the news of them does. Sometimes before breakfast.',
  },
  knights: {
    id: 'knights', name: 'Banner Knights', namePlural: 'Banner Knights', tier: 2,
    atk: 7, def: 5, hits: 5, cost: 150, upkeep: 4, traits: ['charge', 'armored'],
    recruit: { building: 'barracks', terrain: ['meadow', 'hills'] },
    icon: 'knight',
    desc: 'Heavy cavalry. Charges on open ground; armor turns aside 15% of hits. Needs a Musterfield in meadow or hills.',
    flavor: 'A ton of oath, iron, and horse. The oath is the dangerous part.',
  },
  wardens: {
    id: 'wardens', name: 'Greenwood Wardens', namePlural: 'Greenwood Wardens', tier: 2,
    atk: 5, def: 4, hits: 4, cost: 100, upkeep: 3, traits: ['ranged', 'forestborn'],
    recruit: { building: 'barracks', terrain: ['forest'] },
    icon: 'leaf',
    desc: 'Forest skirmishers. Volley before melee; +25% strength among trees. Needs a Musterfield in forest.',
    flavor: 'You will not see them. That is rather the point of them.',
  },
  cragguard: {
    id: 'cragguard', name: 'Cragguard', namePlural: 'Cragguard', tier: 2,
    atk: 4, def: 7, hits: 5, cost: 105, upkeep: 3, traits: ['brace', 'mountainborn'],
    recruit: { building: 'barracks', terrain: ['mountain'] },
    icon: 'peak',
    desc: 'Mountain heavy foot. Braces charges; +25% strength in the crags. Needs a Musterfield in mountains.',
    flavor: 'They count a battle lost if they had to take a step backward to win it.',
  },
  adepts: {
    id: 'adepts', name: 'Ember Adepts', namePlural: 'Ember Adepts', tier: 2,
    atk: 3, def: 3, hits: 3, cost: 120, upkeep: 3, traits: ['caster'],
    recruit: { building: 'mageTower' },
    icon: 'staff',
    desc: 'Battle-casters. Add magical weight to combat and kindle +1 Emberlight each season. Needs an Ember Spire.',
    flavor: 'Graduates of the Spires: singed eyebrows, steady hands, alarming confidence.',
  },
  siegeworks: {
    id: 'siegeworks', name: 'Siegeworks', namePlural: 'Siegeworks', tier: 3,
    atk: 3, def: 1, hits: 4, cost: 140, upkeep: 3, traits: ['siege'],
    recruit: { building: 'warcamp' },
    icon: 'trebuchet',
    desc: 'Engines and engineers. Negates wall bonuses when attacking; nearly helpless alone. Needs a War Foundry.',
    flavor: 'Mathematics, timber, and spite, assembled into a machine for ending sieges.',
  },
  ashwings: {
    id: 'ashwings', name: 'Ashwing Riders', namePlural: 'Ashwing Riders', tier: 3,
    atk: 8, def: 4, hits: 4, cost: 220, upkeep: 5, traits: ['flying', 'charge'],
    recruit: { building: 'warcamp', terrain: ['mountain'] },
    icon: 'wing',
    desc: 'Riders on great grey raptors. Fly over rivers; +10% attack; charge on any ground. Raised at mountain War Foundries.',
    flavor: 'The birds nested in the broken places after the Sundering. Some fools climbed up with saddles.',
  },
  sunblades: {
    id: 'sunblades', name: 'Order of the Sunblade', namePlural: 'Sunblade Knights', tier: 3,
    atk: 8, def: 6, hits: 5, cost: 240, upkeep: 5, traits: ['armored', 'unyielding'],
    recruit: { building: 'warcamp', creed: 'flame' },
    icon: 'sunsword',
    desc: 'Flame elite. Armored, immune to terror, never routs. Flame lords only, at a War Foundry.',
    flavor: 'Each blade is quenched in hearth-ash and sworn to one impossible thing: the throne, relit.',
  },
  barrowguard: {
    id: 'barrowguard', name: 'Barrowguard', namePlural: 'Barrowguard', tier: 3,
    atk: 5, def: 9, hits: 6, cost: 230, upkeep: 4, traits: ['brace', 'unyielding'],
    recruit: { building: 'warcamp', creed: 'ash' },
    icon: 'barrowshield',
    desc: 'Ash elite. Immense defense, braces, immune to terror. Ash lords only, at a War Foundry.',
    flavor: 'They swear their watch at the old graves. What they promise the dead, they keep for the living.',
  },
  shadecloaks: {
    id: 'shadecloaks', name: 'Shadecloaks', namePlural: 'Shadecloaks', tier: 3,
    atk: 8, def: 3, hits: 4, cost: 210, upkeep: 4, traits: ['ambush', 'terror'],
    recruit: { building: 'warcamp', creed: 'umbra' },
    icon: 'hood',
    desc: 'Umbra elite. +25% attack when striking first; spreads terror (−8% enemy strength). Umbra lords only, at a War Foundry.',
    flavor: 'Paid in silver, silence, and the first pick of the dead men’s boots.',
  },
  // ----------------------------------------------------------- neutral-only
  rebels: {
    id: 'rebels', name: 'Rebel Band', namePlural: 'Rebel Bands', tier: 1,
    atk: 3, def: 3, hits: 4, cost: 0, upkeep: 0, traits: ['ragged'],
    recruit: null,
    icon: 'torch',
    desc: 'Angry subjects under a burned banner. They know the ground and nothing about drill.',
    flavor: 'Grievances, organized. The pitchforks are mostly punctuation.',
  },
  marauders: {
    id: 'marauders', name: 'Wolfshead Band', namePlural: 'Wolfshead Bands', tier: 1,
    atk: 5, def: 3, hits: 4, cost: 0, upkeep: 0, traits: ['ambush', 'ragged'],
    recruit: null,
    icon: 'wolf',
    desc: 'Outlawed soldiery living off the land. Hits hard from ambush, melts away from a real fight.',
    flavor: 'Deserters from six armies, loyal to a seventh: their own stomachs.',
  },
  revenants: {
    id: 'revenants', name: 'Barrow Revenants', namePlural: 'Barrow Revenants', tier: 2,
    // v15 balance: the dead march free of wages, but they swing like the
    // dead (5/5→4/4) and the RAISING has a price: a conclusive 41% mirror
    // winrate said a free elite standing army was two dials too generous.
    // Still tireless; still terror; still unyielding.
    atk: 4, def: 4, hits: 5, cost: 90, upkeep: 0, traits: ['terror', 'unyielding'],
    recruit: {}, // gated in code: Morrikan's perk + a barrow site
    icon: 'skull',
    desc: 'The unquiet dead of the old wars. Terrifying, tireless, and very poor conversation, though the rites that wake them are not free.',
    flavor: 'The Sundering woke things that had been politely pretending to sleep.',
  },
};

export const RECRUITABLE: UnitTypeId[] = (Object.keys(UNITS) as UnitTypeId[])
  .filter((id) => UNITS[id].recruit !== null);

export function vetMult(vet: 0 | 1 | 2): number {
  return 1 + vet * 0.12;
}

export const VET_NAMES = ['Green', 'Seasoned', 'Veteran'] as const;
