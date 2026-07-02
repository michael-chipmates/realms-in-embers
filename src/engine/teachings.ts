/**
 * Osperan's marginalia: the first time a mechanic touches a player, he
 * explains it — in character, once, in the margin of the chronicle.
 * Veteran mode hides the whole layer (they're filtered by kind).
 */
import { scribe } from './narrator';
import type { GameState, PlayerId } from './types';

const TEACHINGS: Record<string, string> = {
  firstCapture:
    'Marginalia — on holding what you take: a conquered province remembers its old masters for five seasons (order suffers), and a folk of another creed is always a little deaf to your law. Garrisons soothe; Hearthshrines soothe better; time soothes best.',
  firstBattleWon:
    'Marginalia — on victory: survivors season into veterans (+12% a rank, to two ranks), and heroes grow on a diet of other men\'s mistakes. Check the battle account: every modifier that decided the day is listed there, and the same list appears BEFORE every battle, in the odds preview. Nothing on my table is hidden.',
  firstBattleLost:
    'Marginalia — on defeat: a beaten army falls back to friendly ground if any adjoins the field; otherwise it disperses entirely. Wounded heroes crawl home and mend in a few seasons. Walls, rivers, deep woods — the ground itself is a soldier, and it fights for whoever reads the odds preview more carefully.',
  firstRebellion:
    'Marginalia — on risings: when a province\'s order falls below 25, rebellion brews each season until it boils. The order tooltip itemizes every cause — taxes, conquest, creeds, strain. Lighten tithes, garrison, build a Hearthshrine, or let it burn and send soldiers. All four are governance.',
  firstLowOrder:
    'Marginalia — on grumbling: a province of yours has slipped below 40 order. Hover the order number: every cause is itemized, nothing is fate. Below 25 it becomes arithmetic with pitchforks.',
  firstHeroLevel:
    'Marginalia — on heroes at the crossroads: at levels 3, 5, 7 and 9 a hero must choose between two arts, and the choice is permanent. Their fighting strength, their luck on quests, even whether death can find them — all of it bends around these choices.',
  firstArtifact:
    'Marginalia — on old things: artifacts rest in your vault until a hero takes them up (the Court screen, on the hero\'s card — weapon, armor, trinket). The dead return their tools to the vault. The tools do not grieve; they wait.',
  firstSpellKnown:
    'Marginalia — on Emberlight: battle-workings weave themselves wherever your army fields casters and your reserves can pay — the odds preview names the spell and its price beforehand. Realm-workings you cast yourself, from the Magic screen, on the map. Emberlight flows from Spires, ember-sites, adepts and magi.',
  firstWar:
    'Marginalia — on war: lords remember. Every deed — this declaration included — sits in a ledger behind their opinion of you (hover the number on the Lords screen), and fades slowly or not at all. Oathbreaking is remembered by EVERYONE, at a discount to your name that outlives most wars.',
  firstQuest:
    'Marginalia — on quests: the hero rolls their best relevant stat plus level and fortune against the difficulty. Triumph pays half again more; disaster wounds, and at the bloodier tiers, kills. The board rotates each season. Precious things go to the bold — and the boldly prepared.',
  firstStrain:
    'Marginalia — on the price of size: your realm has grown large enough that every province feels the strain of rule (order drips away at the edges of a wide grasp). Every rival can see it too. Empires do not fall; they sag.',
  firstDefiance:
    'Marginalia — on being the underdog: the realm loves a hard-luck banner. While you trail the leader badly, your musters cost less and your provinces stand a little taller. It is listed in every tooltip it touches. Use it; the leader certainly knows about it.',
  firstSeaMove:
    'Marginalia — on salt roads: harbors link your coasts — an army may sail between them once a season, though storming ashore against a defended coast costs 15% of its strength. The sea asks no creed.',
  firstEvent:
    'Marginalia — on the realm answering back: events state their costs truthfully, and so do I. What they occasionally hide is a consequence with a longer stride. Choose like a ruler; the chronicle keeps the receipts.',
};

/** Write a teaching once per player. No-op if already taught or veteran mode. */
export function teach(state: GameState, pid: PlayerId, key: keyof typeof TEACHINGS): void {
  if (pid < 0) return;
  const player = state.players[pid];
  if (player.kind !== 'human') return; // rivals need no schooling
  if (state.settings.veteranChronicle) return;
  if (player.flags[`taught:${key}`]) return;
  player.flags[`taught:${key}`] = true;
  scribe(state, {
    kind: 'teaching',
    about: pid,
    privateTo: pid,
    text: TEACHINGS[key],
  });
}
