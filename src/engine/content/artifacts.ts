/**
 * The artifact pool. Quests surface them, heroes carry them, the vault keeps
 * the rest. Three Shards of the Ember Throne anchor the Grand Saga; one or
 * two pieces bite the hand that wields them, and say so up front.
 */

export type ArtifactSlot = 'weapon' | 'armor' | 'trinket';
export type ArtifactRarity = 'fine' | 'storied' | 'legendary';

export interface ArtifactFx {
  might?: number;
  lore?: number;
  guile?: number;
  leadership?: number;
  /** Reduces the chance a stricken hero dies (0.1 = -10 percentage points). */
  deathSave?: number;
  /** Multiplies the whole army's power when the bearer leads it. */
  armyPowerPct?: number;
  /** Bonus to quest rolls. */
  questAdd?: number;
  /** Hero xp gain multiplier. */
  xpMult?: number;
  /** Spell cost discount while the bearer lives (percent). */
  spellDiscountPct?: number;
  /** Order each turn in the province where the bearer stands. */
  orderAura?: number;
  /** Emberlight each turn. */
  emberlight?: number;
  /** Curse: order penalty in the bearer's province. */
  dreadAura?: number;
}

export interface ArtifactDef {
  id: string;
  name: string;
  slot: ArtifactSlot;
  rarity: ArtifactRarity;
  fx: ArtifactFx;
  /** Saga shard marker. */
  shard?: boolean;
  desc: string;
  flavor: string;
}

export const ARTIFACTS: Record<string, ArtifactDef> = {
  // ------------------------------------------------------------ weapons
  wardensLongknife: {
    id: 'wardensLongknife', name: "The Warden's Longknife", slot: 'weapon', rarity: 'fine',
    fx: { might: 1, guile: 1 },
    desc: '+1 might, +1 guile.',
    flavor: 'Forty summers of border work, honed to a whisper.',
  },
  oathbrand: {
    id: 'oathbrand', name: 'Oathbrand', slot: 'weapon', rarity: 'storied',
    fx: { might: 2, leadership: 1 },
    desc: '+2 might, +1 leadership.',
    flavor: 'Sworn blades keep their edge. This one has been sworn eleven times and broken none.',
  },
  cindersong: {
    id: 'cindersong', name: 'Cindersong', slot: 'weapon', rarity: 'storied',
    fx: { might: 2, lore: 1 },
    desc: '+2 might, +1 lore.',
    flavor: 'It hums in firelight. The tune is old, and the words, mercifully, are lost.',
  },
  theQuietArgument: {
    id: 'theQuietArgument', name: 'The Quiet Argument', slot: 'weapon', rarity: 'storied',
    fx: { guile: 3 },
    desc: '+3 guile.',
    flavor: 'A stiletto of debate-settling reputation. Most disputes concede on sight.',
  },
  dawnhammer: {
    id: 'dawnhammer', name: 'Dawnhammer', slot: 'weapon', rarity: 'legendary',
    fx: { might: 3, leadership: 2, armyPowerPct: 5 },
    desc: '+3 might, +2 leadership; the bearer\'s army fights +5%.',
    flavor: 'It broke the gate of the Hollow City at first light. The city has kept different hours since.',
  },
  gravebiter: {
    id: 'gravebiter', name: 'Gravebiter', slot: 'weapon', rarity: 'storied',
    fx: { might: 3, dreadAura: -1 },
    desc: '+3 might. Cursed: −1 order each turn wherever the bearer stands.',
    flavor: 'It wins every fight and sours every feast. The smiths refuse to unmake it; it holds grudges.',
  },
  // ------------------------------------------------------------- armor
  pilgrimsMail: {
    id: 'pilgrimsMail', name: "Pilgrim's Mail", slot: 'armor', rarity: 'fine',
    fx: { deathSave: 0.1 },
    desc: 'The bearer is 10% less likely to die of battle wounds.',
    flavor: 'Blessed at nine shrines, patched at ten.',
  },
  emberScaleCoat: {
    id: 'emberScaleCoat', name: 'Ember-Scale Coat', slot: 'armor', rarity: 'storied',
    fx: { deathSave: 0.15, might: 1 },
    desc: '+1 might; 15% less likely to die of wounds.',
    flavor: 'Scales of a thing that nested in the broken throne-hall. It disliked visitors.',
  },
  barrowWardensPlate: {
    id: 'barrowWardensPlate', name: "Barrow-Warden's Plate", slot: 'armor', rarity: 'storied',
    fx: { deathSave: 0.2, leadership: 1 },
    desc: '+1 leadership; 20% less likely to die of wounds.',
    flavor: 'Its first owner watched the dead for sixty years and retired undefeated.',
  },
  mantleOfTheMere: {
    id: 'mantleOfTheMere', name: 'Mantle of the Mere', slot: 'armor', rarity: 'storied',
    fx: { lore: 2, spellDiscountPct: 10 },
    desc: '+2 lore; your spells cost 10% less while the bearer lives.',
    flavor: 'Woven from mist by someone very patient or very cold.',
  },
  theUnkindestShirt: {
    id: 'theUnkindestShirt', name: 'The Unkindest Shirt', slot: 'armor', rarity: 'legendary',
    fx: { deathSave: 0.3, might: 1, dreadAura: -1 },
    desc: '+1 might; 30% less likely to die of wounds. Cursed: −1 order where the bearer stands.',
    flavor: 'It simply refuses to let you die, in a tone that ruins morale.',
  },
  // ------------------------------------------------------------ trinkets
  lanternOfTheLastWatch: {
    id: 'lanternOfTheLastWatch', name: 'Lantern of the Last Watch', slot: 'trinket', rarity: 'storied',
    fx: { leadership: 2, orderAura: 1 },
    desc: '+2 leadership; +1 order each turn where the bearer stands.',
    flavor: 'It has never gone out. The Watch it served, regrettably, did.',
  },
  chroniclersRing: {
    id: 'chroniclersRing', name: "The Chronicler's Ring", slot: 'trinket', rarity: 'storied',
    fx: { xpMult: 1.25, guile: 1 },
    desc: '+1 guile; the bearer earns 25% more experience.',
    flavor: 'Osperan denies ever owning a ring. He denies it in suspicious detail.',
  },
  emberChip: {
    id: 'emberChip', name: 'Ember-Chip', slot: 'trinket', rarity: 'fine',
    fx: { emberlight: 1 },
    desc: '+1 Emberlight each turn.',
    flavor: 'A pebble of the old throne, warm as a sparrow. Everyone owns a fake; this one is not.',
  },
  wayfindersDie: {
    id: 'wayfindersDie', name: "Wayfinder's Die", slot: 'trinket', rarity: 'fine',
    fx: { questAdd: 2 },
    desc: '+2 to quest rolls.',
    flavor: 'A bone die that always rolls the direction home. Gamblers hate it; the lost do not.',
  },
  crownOfSmallCandles: {
    id: 'crownOfSmallCandles', name: 'Crown of Small Candles', slot: 'trinket', rarity: 'legendary',
    fx: { leadership: 3, orderAura: 2 },
    desc: '+3 leadership; +2 order each turn where the bearer stands.',
    flavor: 'Not the Ember Crown. A crown for the meantime, say its wearers, and mean it less each year.',
  },
  hollowCoin: {
    id: 'hollowCoin', name: 'The Hollow Coin', slot: 'trinket', rarity: 'storied',
    fx: { guile: 2, questAdd: 1 },
    desc: '+2 guile, +1 to quest rolls.',
    flavor: 'Both faces show tails. Somehow it keeps winning tosses.',
  },
  // --------------------------------------------------------- saga shards
  shardOfMorning: {
    id: 'shardOfMorning', name: 'Shard of the Throne: Morning', slot: 'trinket', rarity: 'legendary', shard: true,
    fx: { emberlight: 2, orderAura: 1 },
    desc: 'Saga shard. +2 Emberlight each turn; +1 order where the bearer stands.',
    flavor: 'A sliver of the seat of kings, still warm with the first fire ever kept.',
  },
  shardOfNoon: {
    id: 'shardOfNoon', name: 'Shard of the Throne: Noon', slot: 'trinket', rarity: 'legendary', shard: true,
    fx: { might: 2, armyPowerPct: 4 },
    desc: 'Saga shard. +2 might; the bearer\'s army fights +4%.',
    flavor: 'It remembers the realm at its height, and burns to be misremembered as modest.',
  },
  emberheart: {
    id: 'emberheart', name: 'The Emberheart', slot: 'trinket', rarity: 'legendary', shard: true,
    fx: { might: 2, lore: 2, leadership: 2, emberlight: 3, orderAura: 1 },
    desc: 'The reforged heart of the Ember Throne. +2 might/lore/leadership, +3 Emberlight, +1 order aura.',
    flavor: 'Two shards, one forge, and a smith who wept the whole while. It beats. Do not tell it otherwise.',
  },
};

export const ARTIFACT_IDS = Object.keys(ARTIFACTS);
/** Quest reward pool (shards excluded — the Saga hands those out itself). */
export const QUEST_ARTIFACTS = ARTIFACT_IDS.filter((id) => !ARTIFACTS[id].shard);
