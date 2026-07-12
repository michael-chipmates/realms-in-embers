/**
 * UX-030: the one window onto legality. evaluateAction answers "may I,
 * what will it cost, and why not" by dry-running the real applyAction on a
 * disposable copy of the state: this engine has exactly one validator, and
 * evaluation reads its verdict instead of re-deriving it, so the two can
 * never drift apart. Costs are itemized from the same selectors the engine
 * debits from.
 *
 * Evaluation never mutates the given state and never consumes its RNG
 * stream (tests enforce both). It judges the action for the player whose
 * season it is: the same seat applyAction would charge.
 */
import { applyAction } from './actions';
import { FERVOR_COST } from './combat';
import { BUILDINGS } from './content/world';
import { UNITS } from './content/units';
import { SPELLS } from './content/spells';
import { buildingCostFor, unitCostFor } from './economy';
import { riteCostFor, spellCostFor } from './magic';
import type { Action, GameState } from './types';

/** Codex chapters an evaluation can point at. ui/panels/codex.ts checks at
 * compile time that every one of these is a real section. */
export type CodexRef =
  | 'battle' | 'units' | 'works' | 'realm' | 'magic' | 'heroes'
  | 'quests' | 'artifacts' | 'twelve' | 'lords' | 'victory';

export interface ActionCost {
  label: string;
  amount: number;
  resource: 'gold' | 'emberlight';
}

export interface ActionEvaluation {
  legal: boolean;
  /** Why not, in the engine's own words. Empty when legal. */
  reasons: string[];
  /** What the action debits the moment it is taken. Proposals that spend
   * only on acceptance (a join-war inducement, a peace sweetener) carry no
   * line here; the treasury check still gates them at dispatch. */
  costs: ActionCost[];
  /** The Codex chapter that teaches the rule this action lives under. */
  codex: CodexRef | null;
}

export function evaluateAction(state: GameState, action: Action): ActionEvaluation {
  return evaluateActions(state, [action])[0];
}

/**
 * Evaluate several candidate actions against the same state (each judged
 * independently, as the only action taken). Cheaper than calling
 * evaluateAction in a loop: the scratch copy is reused across illegal
 * candidates, which applyAction is guaranteed to leave untouched.
 */
export function evaluateActions(state: GameState, actions: Action[]): ActionEvaluation[] {
  let scratch: GameState | null = null;
  return actions.map((action) => {
    const costs = costsOf(state, action);
    const codex = codexOf(action);
    let legal = false;
    let reasons: string[] = [];
    scratch ??= structuredClone(state);
    try {
      const result = applyAction(scratch, action);
      legal = result.ok;
      if (!result.ok && result.error) reasons = [result.error];
      if (result.ok) scratch = null; // the dry run spent this copy
    } catch (err) {
      // A crash inside an action is a bug, but evaluation must stay safe.
      reasons = [`Engine error: ${err instanceof Error ? err.message : String(err)}`];
      scratch = null; // may be half-mutated
    }
    return { legal, reasons, costs, codex };
  });
}

// ------------------------------------------------------------------ costs

function costsOf(state: GameState, action: Action): ActionCost[] {
  const pid = state.current;
  const player = state.players[pid];
  switch (action.t) {
    case 'build': {
      const def = BUILDINGS[action.building];
      if (!def) return [];
      const { cost, lines } = buildingCostFor(state, pid, action.building);
      return [{ label: withNotes(def.name, lines), amount: cost, resource: 'gold' }];
    }
    case 'recruit': {
      const def = UNITS[action.unit];
      if (!def?.recruit) return [];
      const { cost, lines } = unitCostFor(state, pid, action.unit);
      return [{ label: withNotes(def.name, lines), amount: cost, resource: 'gold' }];
    }
    case 'hireHero': {
      const offer = player?.courtOffers[action.offerIdx];
      if (!offer) return [];
      return [{ label: `${offer.name} joins the court`, amount: offer.cost, resource: 'gold' }];
    }
    case 'moveArmy': {
      if (!action.fervor) return [];
      return [{ label: 'Emberlight fervor', amount: FERVOR_COST, resource: 'emberlight' }];
    }
    case 'diplomacy': {
      if (action.kind !== 'gift') return [];
      const gold = Math.max(0, Math.floor(action.gold ?? 0));
      return gold > 0 ? [{ label: 'Gift of gold', amount: gold, resource: 'gold' }] : [];
    }
    case 'castSpell': {
      const def = SPELLS[action.spell];
      if (!def) return [];
      return [{ label: def.name, amount: spellCostFor(state, pid, action.spell), resource: 'emberlight' }];
    }
    case 'startRite': {
      // The rite itself debits nothing (pledges do), but the full price is
      // the number a player decides with, so it rides along informationally
      // in pledgeEmberlight's lines, not here.
      return [];
    }
    case 'pledgeEmberlight': {
      const amount = Math.floor(action.amount);
      if (amount <= 0) return [];
      const need = player?.rite ? player.rite.cost - player.rite.paid : amount;
      const pledged = Math.min(amount, Math.max(0, need));
      if (pledged <= 0) return [];
      const total = player?.rite ? riteCostFor(state, pid, player.rite.spellId) : null;
      const label = total !== null ? `Pledged to the rite (of ${total} in all)` : 'Pledged to the rite';
      return [{ label, amount: pledged, resource: 'emberlight' }];
    }
    default:
      return [];
  }
}

function withNotes(name: string, lines: string[]): string {
  return lines.length > 0 ? `${name} (${lines.join(', ')})` : name;
}

// ------------------------------------------------------------------ codex

function codexOf(action: Action): CodexRef | null {
  switch (action.t) {
    case 'moveArmy':
    case 'recallMove':
    case 'splitArmy':
    case 'setStance':
    case 'mergeArmies':
    case 'disband':
      return 'battle';
    case 'recruit':
      return 'units';
    case 'build':
      return 'works';
    case 'setTax':
      return 'realm';
    case 'castSpell':
    case 'startRite':
    case 'pledgeEmberlight':
      return 'magic';
    case 'hireHero':
    case 'dismissHero':
    case 'attachHero':
    case 'chooseSkill':
      return 'heroes';
    case 'startQuest':
      return 'quests';
    case 'equip':
    case 'unequip':
      return 'artifacts';
    case 'signature':
      return 'twelve';
    case 'diplomacy':
    case 'respond':
      return 'lords';
    case 'endTurn':
    case 'concede':
      return 'victory';
    default:
      return null;
  }
}
