/**
 * Heroes: creation, experience, leveling, wounds.
 * Skill trees and quest resolution build on this in quests.ts / magic.ts.
 */
import { makePersonName } from './content/names';
import { SKILL_LEVELS, SKILLS_BY_CLASS } from './content/skills';
import type { Rng } from './rng';
import type { GameState, Hero, HeroClass, PlayerId } from './types';

export interface HeroClassDef {
  id: HeroClass;
  name: string;
  desc: string;
  base: { might: number; lore: number; guile: number; leadership: number };
  /** Level-up growth weights. */
  growth: { might: number; lore: number; guile: number; leadership: number };
  hireCost: number;
  wage: number;
  icon: string;
}

export const HERO_CLASSES: Record<HeroClass, HeroClassDef> = {
  champion: {
    id: 'champion',
    name: 'Champion',
    desc: 'A battlefield legend in the making. Leads armies hard and hits harder.',
    base: { might: 4, lore: 0, guile: 1, leadership: 3 },
    growth: { might: 3, lore: 0.5, guile: 1, leadership: 2.5 },
    hireCost: 120,
    wage: 8,
    icon: 'sword',
  },
  magus: {
    id: 'magus',
    name: 'Magus',
    desc: 'A wielder of Emberlight. Casts in battle, kindles your reserves, unravels the arcane on quests.',
    base: { might: 1, lore: 4, guile: 1, leadership: 1 },
    growth: { might: 0.5, lore: 3, guile: 1.5, leadership: 1 },
    hireCost: 140,
    wage: 9,
    icon: 'staff',
  },
  warden: {
    id: 'warden',
    name: 'Warden',
    desc: 'A pathfinder and huntmaster. Strong on quests, steady in command, at home in wild country.',
    base: { might: 2, lore: 1, guile: 3, leadership: 2 },
    growth: { might: 1.5, lore: 1, guile: 2.5, leadership: 2 },
    hireCost: 100,
    wage: 7,
    icon: 'bow',
  },
  shade: {
    id: 'shade',
    name: 'Shade',
    desc: 'A professional of the quiet arts. Unmatched on dangerous quests; heroes of this kind die old or famous, rarely both.',
    base: { might: 2, lore: 1, guile: 4, leadership: 0 },
    growth: { might: 1.5, lore: 1, guile: 3, leadership: 0.5 },
    hireCost: 110,
    wage: 8,
    icon: 'hood',
  },
};

export const MAX_HERO_LEVEL = 10;

/** XP needed to reach the NEXT level from `level`. */
export function xpForLevel(level: number): number {
  return 35 + level * 28;
}

export function createHero(
  state: GameState,
  rng: Rng,
  owner: PlayerId,
  cls: HeroClass,
  level: number,
  province: number,
  named?: { name: string; epithet: string },
): Hero {
  const def = HERO_CLASSES[cls];
  const { name, epithet } = named ?? makePersonName(rng, cls);
  const hero: Hero = {
    id: state.nextHeroId++,
    owner,
    name,
    epithet,
    cls,
    level: 1,
    xp: 0,
    might: def.base.might,
    lore: def.base.lore,
    guile: def.base.guile,
    leadership: def.base.leadership,
    status: 'ready',
    woundedTurns: 0,
    province,
    armyId: null,
    artifacts: { weapon: null, armor: null, trinket: null },
    skills: [],
    spells: cls === 'magus' ? ['cinderbolt'] : [],
    deeds: [],
    questId: null,
    levelChoices: [],
  };
  for (let l = 1; l < level; l++) autoLevel(hero, rng);
  hero.level = level;
  state.heroes[hero.id] = hero;
  return hero;
}

/** Stat growth on level-up (skills are chosen separately at 3/5/7/9). */
export function autoLevel(hero: Hero, rng: Rng): void {
  const g = HERO_CLASSES[hero.cls].growth;
  for (let pick = 0; pick < 2; pick++) {
    const stat = rng.pickWeighted(
      ['might', 'lore', 'guile', 'leadership'] as const,
      (s) => g[s],
    );
    hero[stat] += 1;
  }
}

/** Grant xp; returns number of levels gained (level-ups applied immediately). */
export function grantXp(hero: Hero, rng: Rng, xp: number): number {
  if (hero.status === 'dead') return 0;
  hero.xp += Math.max(0, Math.round(xp));
  let gained = 0;
  while (hero.level < MAX_HERO_LEVEL && hero.xp >= xpForLevel(hero.level)) {
    hero.xp -= xpForLevel(hero.level);
    hero.level++;
    autoLevel(hero, rng);
    gained++;
    // milestone levels offer a choice of arts (3/5/7/9)
    if (SKILL_LEVELS.includes(hero.level)) {
      // an unclaimed earlier offer resolves to its first option — the road teaches
      if (hero.levelChoices.length > 0) {
        hero.skills.push(hero.levelChoices[0]);
        hero.levelChoices = [];
      }
      const pool = SKILLS_BY_CLASS[hero.cls].filter((s) => !hero.skills.includes(s));
      if (pool.length > 0) {
        hero.levelChoices = rng.shuffle(pool).slice(0, Math.min(2, pool.length));
      }
    }
  }
  return gained;
}

export function heroTitleLine(hero: Hero): string {
  return `${hero.name}, ${hero.epithet} — ${HERO_CLASSES[hero.cls].name}, level ${hero.level}`;
}

export function woundHero(hero: Hero, turns: number): void {
  hero.status = 'wounded';
  hero.woundedTurns = Math.max(hero.woundedTurns, turns);
}

export function addDeed(hero: Hero, deed: string, maxKeep = 12): void {
  hero.deeds.push(deed);
  if (hero.deeds.length > maxKeep) hero.deeds.shift();
}
