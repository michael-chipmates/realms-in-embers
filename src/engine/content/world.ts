/**
 * The world's fixed truths: creeds, terrain, buildings.
 * Every `desc` is the mechanical truth shown in tooltips; every `flavor` is
 * Osperan's marginal note. Neither is ever a placeholder.
 */
import type { BuildingId, Creed, Terrain } from '../types';

// ------------------------------------------------------------------- creeds

export interface CreedDef {
  id: Creed;
  name: string;
  tagline: string;
  desc: string;
  /** Small visible passive every lord of the creed enjoys. */
  passive: string;
}

export const CREEDS: Record<Creed, CreedDef> = {
  flame: {
    id: 'flame',
    name: 'The Flame',
    tagline: 'Relight the throne. Whatever it costs.',
    desc: 'Creed of order and zeal. Flame lords trust each other, despise the Umbra, and take broken oaths very personally.',
    passive: 'Hearthshrines grant +1 extra order each turn.',
  },
  ash: {
    id: 'ash',
    name: 'The Ash',
    tagline: 'Let the old world rest. Endure.',
    desc: 'Creed of balance and the land. Ash lords keep their distance from both zealots and schemers, and their provinces recover faster.',
    passive: 'Prosperity in your provinces recovers 50% faster.',
  },
  umbra: {
    id: 'umbra',
    name: 'The Umbra',
    tagline: 'The dark between embers is a ladder.',
    desc: 'Creed of ambition and cunning. Umbra lords forgive treachery as professional courtesy — and remember kindness as weakness.',
    passive: 'Winning a battle plunders +10 gold.',
  },
};

/** How creed a regards creed b, before any deeds: -20..+20. */
export function creedAffinity(a: Creed, b: Creed): number {
  if (a === b) return 15;
  if ((a === 'flame' && b === 'umbra') || (a === 'umbra' && b === 'flame')) return -20;
  return -5;
}

// ------------------------------------------------------------------ terrain

export interface TerrainDef {
  id: Terrain;
  name: string;
  /** Base gold per turn at prosperity 1.0, fair tax. */
  income: number;
  /** Defender strength multiplier when fighting here. */
  defense: number;
  desc: string;
  flavor: string;
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  meadow: {
    id: 'meadow',
    name: 'Meadowlands',
    income: 14,
    defense: 1.0,
    desc: 'Rich income. No defensive ground. Riders and knights may be raised here; granaries thrive.',
    flavor: 'Bread, levies, and nowhere to hide. Every war is finally about the meadows.',
  },
  forest: {
    id: 'forest',
    name: 'Deepwood',
    income: 9,
    defense: 1.15,
    desc: 'Modest income. Defenders +15%. Wardens may be raised here; charges falter among the trees.',
    flavor: 'The old woods keep their own counsel, and occasionally the bones of surveyors.',
  },
  hills: {
    id: 'hills',
    name: 'Highdowns',
    income: 10,
    defense: 1.15,
    desc: 'Fair income. Defenders +15%. Riders may be raised here; granaries thrive on the terraces.',
    flavor: 'Sheep country. The shepherds watch armies pass and raise their prices accordingly.',
  },
  mountain: {
    id: 'mountain',
    name: 'Crags',
    income: 7,
    defense: 1.3,
    desc: 'Poor income. Defenders +30%. Cragguard may be raised here; ember-sites favour the peaks.',
    flavor: 'Stone remembers the Sundering better than men do. It is still warm in places.',
  },
  moor: {
    id: 'moor',
    name: 'Mistmoor',
    income: 6,
    defense: 1.1,
    desc: 'Poor income. Defenders +10%. Barrows and old circles gather here; quests often lead into the fens.',
    flavor: 'The moor drinks roads, patience, and the occasional tax collector.',
  },
};

export const COASTAL_INCOME = 3;

// ---------------------------------------------------------------- buildings

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  turns: number;
  icon: string;
  desc: string;
  flavor: string;
  requires?: BuildingId;
  terrain?: Terrain[];
  coastalOnly?: boolean;
  /** Engine effect data. */
  incomeAdd?: number;
  incomeMult?: number;
  orderDrift?: number;
  emberlight?: number;
  /** Defender multiplier contribution (walls). */
  defense?: number;
  unlocksTier?: 2 | 3;
  extraMove?: boolean;
  seaMove?: boolean;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  farm: {
    id: 'farm', name: 'Granaries', cost: 80, turns: 1, icon: 'wheat',
    desc: '+5 gold each turn. Meadow and hill provinces only.',
    flavor: 'Full stores make loyal villages and attractive targets, usually in that order.',
    terrain: ['meadow', 'hills'], incomeAdd: 5,
  },
  market: {
    id: 'market', name: 'Market Rows', cost: 120, turns: 2, icon: 'scale',
    desc: '+25% gold from this province.',
    flavor: 'Where wool becomes silver and rumour becomes fact by the third stall.',
    incomeMult: 0.25,
  },
  harbor: {
    id: 'harbor', name: 'Harborworks', cost: 100, turns: 1, icon: 'anchor',
    desc: '+6 gold each turn. Armies may sail between your harbors along the coast.',
    flavor: 'The sea asks no creed. It drowns everyone with perfect impartiality.',
    coastalOnly: true, incomeAdd: 6, seaMove: true,
  },
  roads: {
    id: 'roads', name: "King's Road", cost: 90, turns: 1, icon: 'road',
    desc: '+10% gold from this province. Armies may march one province further through your roads.',
    flavor: 'Paved with good intentions and, in the low stretches, with the previous road.',
    incomeMult: 0.1, extraMove: true,
  },
  walls1: {
    id: 'walls1', name: 'Palisade', cost: 70, turns: 1, icon: 'fence',
    desc: 'Defenders here +20%. Siege engines ignore walls.',
    flavor: 'Sharpened logs, honest work. It will stop wolves and discourage optimists.',
    defense: 0.2,
  },
  walls2: {
    id: 'walls2', name: 'Stone Walls', cost: 140, turns: 2, icon: 'wall',
    desc: 'Defenders here +35%. Requires a Palisade. Siege engines ignore walls.',
    flavor: 'Stone politely declines most arguments.',
    requires: 'walls1', defense: 0.35,
  },
  walls3: {
    id: 'walls3', name: 'High Keep', cost: 240, turns: 3, icon: 'keep',
    desc: 'Defenders here +50%. Requires Stone Walls. Siege engines ignore walls.',
    flavor: 'A keep is a promise made in masonry: you will die of old age before we open this gate.',
    requires: 'walls2', defense: 0.5,
  },
  temple: {
    id: 'temple', name: 'Hearthshrine', cost: 100, turns: 1, icon: 'flame',
    desc: '+2 order each turn (+3 for Flame lords).',
    flavor: 'A tended fire, a swept floor, somewhere to grieve. Order is mostly this.',
    orderDrift: 2,
  },
  mageTower: {
    id: 'mageTower', name: 'Ember Spire', cost: 150, turns: 2, icon: 'spire',
    desc: '+2 Emberlight each turn (+2 more on an ember-site). Allows raising Adepts.',
    flavor: 'The masons build them tall not for majesty but because the wizards keep singeing the ceilings.',
    emberlight: 2,
  },
  barracks: {
    id: 'barracks', name: 'Musterfield', cost: 110, turns: 1, icon: 'banner',
    desc: 'Allows raising trained soldiers (tier 2) here.',
    flavor: 'Where farm boys learn which end goes in the other fellow.',
    unlocksTier: 2,
  },
  warcamp: {
    id: 'warcamp', name: 'War Foundry', cost: 200, turns: 2, icon: 'hammer',
    desc: 'Allows raising elite companies and siege engines (tier 3) here. Requires a Musterfield.',
    flavor: 'The anvils ring through the night. The neighbours have stopped complaining; they moved.',
    requires: 'barracks', unlocksTier: 3,
  },
};

export const BUILD_ORDER: BuildingId[] = [
  'farm', 'market', 'harbor', 'roads', 'walls1', 'walls2', 'walls3',
  'temple', 'mageTower', 'barracks', 'warcamp',
];
