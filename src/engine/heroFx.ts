/**
 * A hero's effective self: base stats + chosen skills + equipped artifacts.
 * Combat, quests, economy and magic all read heroes through this lens.
 */
import { ARTIFACTS, type ArtifactFx } from './content/artifacts';
import { SKILLS } from './content/skills';
import type { GameState, Hero } from './types';

export interface HeroDerived {
  might: number;
  lore: number;
  guile: number;
  leadership: number;
  /** Subtracted from death chance when stricken. */
  deathSave: number;
  questAdd: number;
  xpMult: number;
  armyPowerPct: number;
  spellDiscountPct: number;
  orderAura: number;
  dreadAura: number;
  emberlight: number;
  /** Names of fx sources, for tooltips. */
  sources: string[];
}

export function heroDerived(state: GameState, hero: Hero): HeroDerived {
  const d: HeroDerived = {
    might: hero.might,
    lore: hero.lore,
    guile: hero.guile,
    leadership: hero.leadership,
    deathSave: 0,
    questAdd: 0,
    xpMult: 1,
    armyPowerPct: 0,
    spellDiscountPct: 0,
    orderAura: 0,
    dreadAura: 0,
    emberlight: 0,
    sources: [],
  };
  const addFx = (fx: ArtifactFx, source: string) => {
    d.might += fx.might ?? 0;
    d.lore += fx.lore ?? 0;
    d.guile += fx.guile ?? 0;
    d.leadership += fx.leadership ?? 0;
    d.deathSave += fx.deathSave ?? 0;
    d.questAdd += fx.questAdd ?? 0;
    d.xpMult *= fx.xpMult ?? 1;
    d.armyPowerPct += fx.armyPowerPct ?? 0;
    d.spellDiscountPct = Math.max(d.spellDiscountPct, fx.spellDiscountPct ?? 0);
    d.orderAura += fx.orderAura ?? 0;
    d.dreadAura += fx.dreadAura ?? 0;
    d.emberlight += fx.emberlight ?? 0;
    d.sources.push(source);
  };
  for (const skillId of hero.skills) {
    const skill = SKILLS[skillId];
    if (skill) addFx(skill.fx, skill.name);
  }
  for (const slot of ['weapon', 'armor', 'trinket'] as const) {
    const artId = hero.artifacts[slot];
    if (artId === null) continue;
    const inst = state.artifacts[artId];
    if (!inst) continue;
    const def = ARTIFACTS[inst.defId];
    if (def) addFx(def.fx, def.name);
  }
  return d;
}

/** Pending skill offers for a hero (2 unpicked class skills), or []. */
export function skillOffersFor(hero: Hero): string[] {
  return hero.levelChoices;
}
