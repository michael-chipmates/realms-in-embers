/**
 * Actions for the hero/magic/quest/event layer. Same contract as actions.ts:
 * validate without consuming randomness, then mutate + log.
 */
import { ARTIFACTS } from './content/artifacts';
import { SKILLS } from './content/skills';
import { SPELLS } from './content/spells';
import { resolveEventChoice } from './events';
import { castRealmSpell, completeRite, riteCostFor } from './magic';
import { startQuest } from './quests';
import type { Rng } from './rng';
import type { Action, Effect, GameState, PlayerId } from './types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  effects: Effect[];
}

const fail = (error: string): ActionResult => ({ ok: false, error, effects: [] });

function logAction(state: GameState, action: Action): void {
  state.log.push({ player: state.current, turn: state.turn, action });
}

export function applyAdvancedAction(
  state: GameState,
  rng: Rng,
  pid: PlayerId,
  action: Action,
  effects: Effect[],
): ActionResult {
  const player = state.players[pid];

  switch (action.t) {
    case 'chooseSkill': {
      const hero = state.heroes[action.heroId];
      if (!hero || hero.owner !== pid || hero.status === 'dead') return fail('No such hero in your service.');
      if (!hero.levelChoices.includes(action.skill)) return fail('That path is not offered.');
      if (!SKILLS[action.skill]) return fail('No such art.');
      hero.skills.push(action.skill);
      hero.levelChoices = [];
      logAction(state, action);
      return { ok: true, effects };
    }

    case 'equip': {
      const hero = state.heroes[action.heroId];
      if (!hero || hero.owner !== pid || hero.status === 'dead') return fail('No such hero in your service.');
      if (hero.status === 'questing') return fail('They are away on a quest.');
      const inst = state.artifacts[action.artifactId];
      if (!inst) return fail('No such artifact.');
      if (!player.vault.includes(action.artifactId)) return fail('That piece is not in your vault.');
      const def = ARTIFACTS[inst.defId];
      if (!def) return fail('The piece defies cataloging.');
      if (def.slot !== action.slot) return fail(`It is ${def.slot === 'weapon' ? 'a weapon' : def.slot === 'armor' ? 'armor' : 'a trinket'}.`);
      // swap out whatever's there
      const current = hero.artifacts[action.slot];
      if (current !== null) player.vault.push(current);
      player.vault = player.vault.filter((id) => id !== action.artifactId);
      hero.artifacts[action.slot] = action.artifactId;
      if (inst.history[inst.history.length - 1] !== hero.name) inst.history.push(hero.name);
      logAction(state, action);
      return { ok: true, effects };
    }

    case 'unequip': {
      const hero = state.heroes[action.heroId];
      if (!hero || hero.owner !== pid || hero.status === 'dead') return fail('No such hero in your service.');
      if (hero.status === 'questing') return fail('They are away on a quest.');
      const current = hero.artifacts[action.slot];
      if (current === null) return fail('Nothing to take.');
      hero.artifacts[action.slot] = null;
      player.vault.push(current);
      logAction(state, action);
      return { ok: true, effects };
    }

    case 'startQuest': {
      const result = startQuest(state, rng, pid, action.heroId, action.questDefId, action.province, effects);
      if (!result.ok) return fail(result.error ?? 'Cannot begin.');
      logAction(state, action);
      return { ok: true, effects };
    }

    case 'startRite': {
      if (player.rite) return fail(`Your court is already deep in the Rite of ${SPELLS[player.rite.spellId].name}.`);
      if (!player.riteOffers.includes(action.spellId)) return fail('The court has not found that working\'s thread.');
      if (player.spells.includes(action.spellId)) return fail('Already known.');
      player.rite = { spellId: action.spellId, paid: 0, cost: riteCostFor(state, pid, action.spellId) };
      logAction(state, action);
      return { ok: true, effects };
    }

    case 'pledgeEmberlight': {
      if (!player.rite) return fail('No rite is underway.');
      const amount = Math.floor(action.amount);
      if (amount <= 0) return fail('Pledge something.');
      if (player.emberlight < amount) return fail('Not that much light to give.');
      const need = player.rite.cost - player.rite.paid;
      const pledged = Math.min(amount, need);
      player.emberlight -= pledged;
      player.rite.paid += pledged;
      logAction(state, action);
      if (player.rite.paid >= player.rite.cost) {
        completeRite(state, rng, pid, effects);
      }
      return { ok: true, effects };
    }

    case 'castSpell': {
      const result = castRealmSpell(state, rng, pid, action.spell, action.province, effects);
      if (!result.ok) return fail(result.error ?? 'The working failed to take.');
      logAction(state, action);
      return { ok: true, effects };
    }

    case 'eventChoice': {
      const result = resolveEventChoice(state, rng, pid, action.eventId, action.choiceIdx, effects);
      if (!result.ok) return fail(result.error ?? 'The moment has passed.');
      logAction(state, action);
      return { ok: true, effects };
    }

    default:
      return fail('Not possible.');
  }
}
