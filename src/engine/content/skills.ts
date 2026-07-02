/**
 * Hero skills — chosen (1 of 2) at levels 3, 5, 7 and 9.
 * Same fx vocabulary as artifacts, so heroes compose cleanly.
 */
import type { HeroClass } from '../types';
import type { ArtifactFx } from './artifacts';

export interface SkillDef {
  id: string;
  name: string;
  cls: HeroClass;
  fx: ArtifactFx;
  desc: string;
  flavor: string;
}

export const SKILLS: Record<string, SkillDef> = {
  // ---------------------------------------------------------- champion
  duelist: {
    id: 'duelist', name: 'Duelist', cls: 'champion', fx: { might: 2 },
    desc: '+2 might.', flavor: 'Footwork, patience, and one unanswerable question.',
  },
  ironBanner: {
    id: 'ironBanner', name: 'Iron Banner', cls: 'champion', fx: { armyPowerPct: 6 },
    desc: 'The army this hero leads fights +6%.', flavor: 'Soldiers glance back at it once, then stop needing to.',
  },
  scarredVeteran: {
    id: 'scarredVeteran', name: 'Scarred Veteran', cls: 'champion', fx: { deathSave: 0.15 },
    desc: '15% less likely to die of wounds.', flavor: 'Death has tried. Death has filed a complaint.',
  },
  voiceOfCommand: {
    id: 'voiceOfCommand', name: 'Voice of Command', cls: 'champion', fx: { leadership: 2 },
    desc: '+2 leadership.', flavor: 'Parade-ground volume, bedside certainty.',
  },
  giantsWager: {
    id: 'giantsWager', name: "Giant's Wager", cls: 'champion', fx: { might: 3, dreadAura: -1 },
    desc: '+3 might, but −1 order where they stand: glory is loud.',
    flavor: 'Bet everything on being the biggest thing in the field. Collect, mostly.',
  },
  standardBearer: {
    id: 'standardBearer', name: 'Standard-Bearer of the Age', cls: 'champion', fx: { leadership: 1, xpMult: 1.2 },
    desc: '+1 leadership; +20% experience.', flavor: 'History follows the banner. So do promotions.',
  },
  // ------------------------------------------------------------- magus
  emberScholar: {
    id: 'emberScholar', name: 'Ember Scholar', cls: 'magus', fx: { lore: 2 },
    desc: '+2 lore.', flavor: 'Has read the forbidden books, and their errata.',
  },
  kindledVeins: {
    id: 'kindledVeins', name: 'Kindled Veins', cls: 'magus', fx: { emberlight: 2 },
    desc: '+2 Emberlight each turn.', flavor: 'Sleeps warm, dreams in orange, pays for nothing by candle.',
  },
  frugalRites: {
    id: 'frugalRites', name: 'Frugal Rites', cls: 'magus', fx: { spellDiscountPct: 15 },
    desc: 'Your spells cost 15% less while this hero lives.', flavor: 'Magic, like soup, is mostly technique and thrift.',
  },
  warWizard: {
    id: 'warWizard', name: 'War-Wizard', cls: 'magus', fx: { armyPowerPct: 5, might: 1 },
    desc: '+1 might; the army they march with fights +5%.', flavor: 'The staff is not ceremonial.',
  },
  farSeer: {
    id: 'farSeer', name: 'Far-Seer', cls: 'magus', fx: { questAdd: 2, guile: 1 },
    desc: '+1 guile, +2 to quest rolls.', flavor: 'Arrives before the omen does.',
  },
  ashenPact: {
    id: 'ashenPact', name: 'Ashen Pact', cls: 'magus', fx: { lore: 3, deathSave: -0.05 },
    desc: '+3 lore, but slightly likelier to die of wounds: the pact collects.',
    flavor: 'Power now, particulars later. The particulars have excellent lawyers.',
  },
  // ------------------------------------------------------------ warden
  pathfinder: {
    id: 'pathfinder', name: 'Pathfinder', cls: 'warden', fx: { questAdd: 3 },
    desc: '+3 to quest rolls.', flavor: 'There is always a way through. Usually damp.',
  },
  huntersEye: {
    id: 'huntersEye', name: "Hunter's Eye", cls: 'warden', fx: { might: 1, guile: 1 },
    desc: '+1 might, +1 guile.', flavor: 'Sees the arrow land before loosing it.',
  },
  wildTongue: {
    id: 'wildTongue', name: 'Wild Tongue', cls: 'warden', fx: { orderAura: 1, leadership: 1 },
    desc: '+1 leadership; +1 order where they stand.', flavor: 'Talks shepherds down, wolves around, and lords out of stupidity.',
  },
  greyCloak: {
    id: 'greyCloak', name: 'Grey Cloak', cls: 'warden', fx: { deathSave: 0.15, guile: 1 },
    desc: '+1 guile; 15% less likely to die of wounds.', flavor: 'Hard to kill what you cannot quite point at.',
  },
  beastFriend: {
    id: 'beastFriend', name: 'Beast-Friend', cls: 'warden', fx: { armyPowerPct: 4, questAdd: 1 },
    desc: 'Army +4%; +1 to quest rolls.', flavor: 'The hawks scout, the dogs guard, the bear is a long story.',
  },
  oldRoads: {
    id: 'oldRoads', name: 'Keeper of Old Roads', cls: 'warden', fx: { leadership: 2, xpMult: 1.15 },
    desc: '+2 leadership; +15% experience.', flavor: 'Knows where every road went before it was lost.',
  },
  // ------------------------------------------------------------- shade
  knifeInTheSmile: {
    id: 'knifeInTheSmile', name: 'Knife in the Smile', cls: 'shade', fx: { guile: 2 },
    desc: '+2 guile.', flavor: 'Charm is a delivery mechanism.',
  },
  secondShadow: {
    id: 'secondShadow', name: 'Second Shadow', cls: 'shade', fx: { deathSave: 0.2 },
    desc: '20% less likely to die of wounds.', flavor: 'Witnesses reliably kill the wrong one.',
  },
  poisonedLedger: {
    id: 'poisonedLedger', name: 'Poisoned Ledger', cls: 'shade', fx: { questAdd: 2, guile: 1 },
    desc: '+1 guile, +2 to quest rolls.', flavor: 'Every debt collected, some in coin.',
  },
  nightTutor: {
    id: 'nightTutor', name: 'Night Tutor', cls: 'shade', fx: { xpMult: 1.3 },
    desc: '+30% experience.', flavor: 'The syllabus is brief and unforgettable.',
  },
  terrorByCandlelight: {
    id: 'terrorByCandlelight', name: 'Terror by Candlelight', cls: 'shade', fx: { armyPowerPct: 5, dreadAura: -1 },
    desc: 'Army +5%, but −1 order where they stand.', flavor: 'Rumour marches ahead of the column, clearing the way.',
  },
  faceless: {
    id: 'faceless', name: 'Faceless', cls: 'shade', fx: { guile: 3, leadership: -1 },
    desc: '+3 guile, −1 leadership: hard to follow what you cannot describe.',
    flavor: 'Descriptions on file: tall, short, bearded, a woman, possibly two children in a cloak.',
  },
};

export const SKILLS_BY_CLASS: Record<HeroClass, string[]> = {
  champion: ['duelist', 'ironBanner', 'scarredVeteran', 'voiceOfCommand', 'giantsWager', 'standardBearer'],
  magus: ['emberScholar', 'kindledVeins', 'frugalRites', 'warWizard', 'farSeer', 'ashenPact'],
  warden: ['pathfinder', 'huntersEye', 'wildTongue', 'greyCloak', 'beastFriend', 'oldRoads'],
  shade: ['knifeInTheSmile', 'secondShadow', 'poisonedLedger', 'nightTutor', 'terrorByCandlelight', 'faceless'],
};

export const SKILL_LEVELS = [3, 5, 7, 9];
