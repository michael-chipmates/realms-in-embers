/**
 * The spellbook of the Sundered Age. Emberlight is the fuel; the Rites are
 * how a court learns. Battle spells weave themselves into combat wherever a
 * side fields casters (always previewed, never secret); realm spells are
 * cast from the war table.
 */
import type { Creed, SpellId } from '../types';

export interface BattleSpellFx {
  /** Multiplies your side's power. */
  powerMult?: number;
  /** Multiplies the enemy's power (use < 1). */
  enemyMult?: number;
  /** Multiplies your casualties after the fact (use < 1). */
  lossMult?: number;
  /** Cancels enemy charge and ambush bonuses. */
  calmGround?: boolean;
}

export interface SpellDef {
  id: SpellId;
  name: string;
  kind: 'battle' | 'realm';
  /** Emberlight to cast (battle spells auto-cast at this price when armed). */
  cost: number;
  /** Rounds before this spell may be cast again (realm spells). */
  cooldown: number;
  /** Emberlight to learn via a Rite. */
  riteCost: number;
  target: 'ownProvince' | 'enemyProvince' | 'anyProvince' | 'ownArmy' | 'none';
  creedAffinity?: Creed;
  battle?: BattleSpellFx;
  icon: string;
  desc: string;
  flavor: string;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  // ------------------------------------------------------------- battle
  cinderbolt: {
    id: 'cinderbolt', name: 'Cinderbolt', kind: 'battle', cost: 6, cooldown: 0, riteCost: 0,
    target: 'none', battle: { powerMult: 1.12 }, icon: 'bolt',
    desc: 'Battle: your side fights +12% stronger. Auto-woven when you field casters and can pay.',
    flavor: 'The first spell every adept learns, and the last thing many enemies do.',
  },
  shieldOfAsh: {
    id: 'shieldOfAsh', name: 'Shield of Ash', kind: 'battle', cost: 6, cooldown: 0, riteCost: 22,
    target: 'none', creedAffinity: 'ash', battle: { lossMult: 0.75 }, icon: 'ashshield',
    desc: 'Battle: your side takes 25% fewer casualties.',
    flavor: 'Ash remembers being wood, and wood remembers standing.',
  },
  panicWhisper: {
    id: 'panicWhisper', name: 'Panic Whisper', kind: 'battle', cost: 8, cooldown: 0, riteCost: 26,
    target: 'none', creedAffinity: 'umbra', battle: { enemyMult: 0.9 }, icon: 'whisper',
    desc: 'Battle: the enemy fights 10% weaker.',
    flavor: 'It says nothing in particular. That is what makes it unanswerable.',
  },
  emberVeil: {
    id: 'emberVeil', name: 'Ember Veil', kind: 'battle', cost: 9, cooldown: 0, riteCost: 28,
    target: 'none', battle: { powerMult: 1.06, lossMult: 0.85 }, icon: 'veil',
    desc: 'Battle: +6% strength and 15% fewer casualties.',
    flavor: 'A curtain of warm light between your people and the arrows.',
  },
  rousingFlame: {
    id: 'rousingFlame', name: 'Rousing Flame', kind: 'battle', cost: 7, cooldown: 0, riteCost: 24,
    target: 'none', creedAffinity: 'flame', battle: { powerMult: 1.1, calmGround: false }, icon: 'rouse',
    desc: 'Battle: your side fights +10% stronger.',
    flavor: 'It does not make soldiers braver. It reminds them they already were.',
  },
  graspingMire: {
    id: 'graspingMire', name: 'Grasping Mire', kind: 'battle', cost: 8, cooldown: 0, riteCost: 26,
    target: 'none', creedAffinity: 'ash', battle: { enemyMult: 0.95, calmGround: true }, icon: 'mire',
    desc: 'Battle: enemy −5%, and their charges and ambushes fail.',
    flavor: 'The ground grows opinions about anyone moving quickly across it.',
  },
  sunlance: {
    id: 'sunlance', name: 'Sunlance', kind: 'battle', cost: 12, cooldown: 0, riteCost: 38,
    target: 'none', creedAffinity: 'flame', battle: { powerMult: 1.2 }, icon: 'sunlance',
    desc: 'Battle: your side fights +20% stronger. The heaviest battle-magic known.',
    flavor: 'For one breath, noon. Wherever you point it.',
  },
  gloomCall: {
    id: 'gloomCall', name: 'Gloom-Call', kind: 'battle', cost: 12, cooldown: 0, riteCost: 38,
    target: 'none', creedAffinity: 'umbra', battle: { enemyMult: 0.85 }, icon: 'gloom',
    desc: 'Battle: the enemy fights 15% weaker.',
    flavor: 'Every soldier owns a private dark. This merely opens all of them at once.',
  },
  // -------------------------------------------------------------- realm
  scryingSmoke: {
    id: 'scryingSmoke', name: 'Scrying Smoke', kind: 'realm', cost: 5, cooldown: 2, riteCost: 18,
    target: 'anyProvince', icon: 'smoke',
    desc: 'Reveal a province and its neighbors, and report every company standing there.',
    flavor: 'The smoke shows what is. Interpretation, as ever, is extra.',
  },
  blessHarvest: {
    id: 'blessHarvest', name: 'Bless the Harvest', kind: 'realm', cost: 10, cooldown: 3, riteCost: 24,
    target: 'ownProvince', icon: 'sheaf',
    desc: 'A province of yours gains +6 gold and +3 order each turn, for 3 turns.',
    flavor: 'The wheat stands taller. The tithe-reeve smiles. Suspicion drops to a five-year low.',
  },
  sowDiscord: {
    id: 'sowDiscord', name: 'Sow Discord', kind: 'realm', cost: 12, cooldown: 3, riteCost: 30,
    target: 'enemyProvince', creedAffinity: 'umbra', icon: 'discord',
    desc: 'An enemy province suffers −6 order each turn for 3 turns.',
    flavor: 'Three rumours, one forged letter, and a shortage of good ale. Kingdoms have fallen to less.',
  },
  wardOfEmbers: {
    id: 'wardOfEmbers', name: 'Ward of Embers', kind: 'realm', cost: 8, cooldown: 2, riteCost: 22,
    target: 'ownProvince', icon: 'ward',
    desc: 'A province of yours defends +20% for 3 turns.',
    flavor: 'Attackers describe a heat-shimmer, a wrongness, a strong preference for being elsewhere.',
  },
  beaconMarch: {
    id: 'beaconMarch', name: 'Beacon March', kind: 'realm', cost: 14, cooldown: 4, riteCost: 34,
    target: 'ownArmy', creedAffinity: 'flame', icon: 'beacon',
    desc: 'One of your armies that has already marched may march again this turn.',
    flavor: 'Light the high fires and the road walks with you.',
  },
  barrowCall: {
    id: 'barrowCall', name: 'Barrow-Call', kind: 'realm', cost: 16, cooldown: 5, riteCost: 36,
    target: 'ownProvince', creedAffinity: 'umbra', icon: 'barrowcall',
    desc: 'Raise two companies of Barrow Revenants at a barrow province you rule.',
    flavor: 'The old dead ask only two questions: who, and how many.',
  },
  seersFlame: {
    id: 'seersFlame', name: "Seer's Flame", kind: 'realm', cost: 10, cooldown: 4, riteCost: 26,
    target: 'none', icon: 'seer',
    desc: 'A private report: every rival\'s treasury, income, armies and heroes, as they stand today.',
    flavor: 'Stare into the flame long enough and it starts doing the accounting for you.',
  },
  quenchling: {
    id: 'quenchling', name: 'Quenchling', kind: 'realm', cost: 9, cooldown: 2, riteCost: 22,
    target: 'ownProvince', creedAffinity: 'ash', icon: 'quench',
    desc: 'A province of yours gains +15 order at once, and forgets it was recently conquered.',
    flavor: 'A small grey spirit that drinks grudges. It is always full and never satisfied.',
  },
  emberTithe: {
    id: 'emberTithe', name: 'Ember Tithe', kind: 'realm', cost: 0, cooldown: 2, riteCost: 20,
    target: 'none', icon: 'tithe',
    desc: 'Convert 40 gold into 10 Emberlight.',
    flavor: 'Gold burns badly, but it burns.',
  },
  veilOfNight: {
    id: 'veilOfNight', name: 'Veil of Night', kind: 'realm', cost: 15, cooldown: 5, riteCost: 32,
    target: 'none', creedAffinity: 'umbra', icon: 'nightveil',
    desc: 'For 2 turns, every province you rule counts +8% harder to attack (confusion in the dark).',
    flavor: 'The realm does not vanish. It simply stops answering to its name.',
  },
};

export const ALL_SPELLS = Object.keys(SPELLS) as SpellId[];
export const RITE_LEARNABLE = ALL_SPELLS.filter((id) => SPELLS[id].riteCost > 0);

/** Spell cost after lord perks. */
export function spellCostFor(discountPct: number, discordDiscountPct: number, id: SpellId): number {
  const def = SPELLS[id];
  let cost = def.cost;
  if (discountPct) cost = Math.round(cost * (1 - discountPct / 100));
  if (id === 'sowDiscord' && discordDiscountPct) cost = Math.round(cost * (1 - discordDiscountPct / 100));
  return cost;
}
