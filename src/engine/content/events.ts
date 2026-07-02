/**
 * Reactive events: the realm answering back. Each event binds to a concrete
 * province/hero when drawn, offers real choices with previewed consequences,
 * and its costs are the costs it states. AI lords choose by temperament.
 */
import { artifactDefIdsInPlay, clamp, grantArtifactTo, heroesOf, lordOf, provincesOf } from '../helpers';
import { grantXp, woundHero } from '../heroes';
import { makeUnits, newArmy } from '../helpers';
import { ARTIFACTS, QUEST_ARTIFACTS } from './artifacts';
import type { LordPersonality } from './lords';
import type { Rng } from '../rng';
import type { Effect, GameState, PlayerId } from '../types';
import { NEUTRAL } from '../types';

export interface EventBinding {
  province: number | null;
  heroId: number | null;
}

export interface EventCtx {
  state: GameState;
  rng: Rng;
  pid: PlayerId;
  province: number | null;
  heroId: number | null;
  effects: Effect[];
}

export interface EventChoice {
  label: string;
  /** The mechanical truth, shown verbatim. */
  preview: string;
  aiScore: (p: LordPersonality, ctx: EventCtx) => number;
  apply: (ctx: EventCtx) => string; // returns the resolution line for the chronicle
}

export interface EventDef {
  id: string;
  title: string;
  weight: number;
  once?: boolean;
  /** Rounds before this event may hit the same player again. */
  cooldown: number;
  when: (state: GameState, pid: PlayerId, rng: Rng) => EventBinding | null;
  text: (ctx: EventCtx) => string;
  choices: EventChoice[];
}

const prov = (ctx: EventCtx) => ctx.state.provinces[ctx.province!];
const hero = (ctx: EventCtx) => ctx.state.heroes[ctx.heroId!];
const player = (ctx: EventCtx) => ctx.state.players[ctx.pid];

function richestProvince(state: GameState, pid: PlayerId, pred?: (p: (typeof state.provinces)[number]) => boolean) {
  const mine = provincesOf(state, pid).filter((p) => (pred ? pred(p) : true));
  if (mine.length === 0) return null;
  return mine.reduce((a, b) => (b.prosperity > a.prosperity ? b : a));
}

export const EVENTS: EventDef[] = [
  {
    id: 'harvestGlut',
    title: 'A Harvest Beyond the Barns',
    weight: 3,
    cooldown: 6,
    when: (state, pid) => {
      const p = richestProvince(state, pid, (pp) => pp.terrain === 'meadow' && pp.order > 45);
      return p ? { province: p.id, heroId: null } : null;
    },
    text: (ctx) => `${prov(ctx).name} has brought in a harvest the granaries cannot hold. Grain merchants circle like well-dressed gulls; the villages eye the surplus and remember lean years.`,
    choices: [
      {
        label: 'Sell the surplus',
        preview: '+90 gold now.',
        aiScore: (p) => 4 + p.greed * 6,
        apply: (ctx) => {
          player(ctx).gold += 90;
          return 'The surplus went to the merchants at a price that made the tally-clerks whistle. (+90 gold)';
        },
      },
      {
        label: 'Fill the poor-barns',
        preview: '+8 order in this province, +2 in every other province you rule.',
        aiScore: (p) => 4 + p.loyalty * 5,
        apply: (ctx) => {
          prov(ctx).order = clamp(prov(ctx).order + 8, 0, 100);
          for (const p of provincesOf(ctx.state, ctx.pid)) {
            if (p.id !== ctx.province) p.order = clamp(p.order + 2, 0, 100);
          }
          return 'The poor-barns were filled to the rafters. Winter lost some of its teeth, and the realm noticed whose seal was on the barn doors. (order rises)';
        },
      },
      {
        label: 'Lay in war-stores',
        preview: 'Your next 3 recruitments cost 20% less (war-stores marker).',
        aiScore: (p) => 3 + p.aggression * 6,
        apply: (ctx) => {
          player(ctx).flags.warStores = true;
          player(ctx).flags.warStoresCount3 = true;
          return 'The surplus went into salt, barrels, and quartermasters\' ledgers. Armies march on exactly this. (next 3 recruitments −20%)';
        },
      },
    ],
  },
  {
    id: 'freeCompany',
    title: 'The Free Company at the Gate',
    weight: 3,
    cooldown: 5,
    when: (state, pid) => {
      const p = provincesOf(state, pid).find((pp) => pp.seatOf === pid) ?? provincesOf(state, pid)[0];
      return p ? { province: p.id, heroId: null } : null;
    },
    text: (ctx) => `A free company — the Broken Wheel, veterans of three losing sides — offers its swords at ${prov(ctx).name}. Their captain is missing an ear and every illusion, and asks for coin, not speeches.`,
    choices: [
      {
        label: 'Hire them (120 gold)',
        preview: '−120 gold; gain 2 seasoned Spearguard and 1 seasoned Longbow company here.',
        aiScore: (p, ctx) => (player(ctx).gold > 250 ? 5 + p.aggression * 4 : 0),
        apply: (ctx) => {
          player(ctx).gold -= 120;
          const units = [...makeUnits('spears', 2, 1), ...makeUnits('archers', 1, 1)];
          newArmy(ctx.state, ctx.pid, ctx.province!, units);
          return 'The Broken Wheel took the coin and the colours. They drill like men who intend to be on the winning side for once. (+3 seasoned companies)';
        },
      },
      {
        label: 'Turn them away',
        preview: 'No cost. They will look for work among your rivals.',
        aiScore: (p) => 3 + (1 - p.aggression) * 3,
        apply: (ctx) => {
          void ctx;
          return 'The captain shrugged his one-eared shrug and led the Wheel back into the weather, toward somebody else\'s war.';
        },
      },
    ],
  },
  {
    id: 'portRats',
    title: 'Rats Off a Foreign Ship',
    weight: 2,
    cooldown: 8,
    when: (state, pid) => {
      const p = provincesOf(state, pid).find((pp) => pp.coastal && pp.buildings.includes('harbor'));
      return p ? { province: p.id, heroId: null } : null;
    },
    text: (ctx) => `A trader out of no port anyone can verify has docked at ${prov(ctx).name}, riding low and rustling. The harbormaster wants it burned. The merchants want it unloaded. The rats want a word with your granaries.`,
    choices: [
      {
        label: 'Quarantine the harbor',
        preview: 'This province: −6 gold income for 2 turns. No plague risk.',
        aiScore: (p) => 5 + p.loyalty * 3,
        apply: (ctx) => {
          prov(ctx).mods.push({ label: 'Harbor quarantine', income: -6, turnsLeft: 2 });
          return 'The harbor chain went up and the ship sat in the roads until the rustling stopped. Trade grumbled; the granaries slept safe. (−6 gold for 2 turns)';
        },
      },
      {
        label: 'Unload her fast',
        preview: '+70 gold now. Risk: plague (−10 order, −0.1 prosperity here) — the odds are even.',
        aiScore: (p) => 2 + p.greed * 6,
        apply: (ctx) => {
          player(ctx).gold += 70;
          if (ctx.rng.chance(0.5)) {
            prov(ctx).order = clamp(prov(ctx).order - 10, 0, 100);
            prov(ctx).prosperity = clamp(prov(ctx).prosperity - 0.1, 0.5, 1.3);
            return 'The cargo paid handsomely. Then the fevers started along the quay-side streets, exactly as the harbormaster predicted, loudly, to anyone left standing. (+70 gold, plague)';
          }
          return 'The cargo paid handsomely and the rats, for once, kept their diseases to themselves. The harbormaster remains furious on principle. (+70 gold)';
        },
      },
    ],
  },
  {
    id: 'oldSoldier',
    title: 'The Petition of Sergeant Wick',
    weight: 2,
    cooldown: 7,
    when: (state, pid) => {
      const p = provincesOf(state, pid)[0];
      return p && state.turn > 6 ? { province: p.id, heroId: null } : null;
    },
    text: () => `Sergeant Wick — thirty years of other people's wars, one leg, three medals of discontinued realms — petitions for the pension the old kingdom promised and no kingdom has paid. Behind him, visible through the window, several hundred veterans are pretending not to wait for your answer.`,
    choices: [
      {
        label: 'Pay the old debts (60 gold)',
        preview: '−60 gold; +3 order in every province you rule.',
        aiScore: (p, ctx) => (player(ctx).gold > 120 ? 4 + p.loyalty * 5 : 1),
        apply: (ctx) => {
          player(ctx).gold -= 60;
          for (const p of provincesOf(ctx.state, ctx.pid)) p.order = clamp(p.order + 3, 0, 100);
          return 'The pensions were paid in full, with arrears. Sergeant Wick saluted with the wrong hand, on purpose, weeping. Every tavern in the realm has heard about it. (+3 order everywhere)';
        },
      },
      {
        label: 'The old realm\'s debts died with it',
        preview: 'No cost. −4 order in every province you rule.',
        aiScore: (p) => 2 + p.greed * 3 + p.pride * 2,
        apply: (ctx) => {
          for (const p of provincesOf(ctx.state, ctx.pid)) p.order = clamp(p.order - 4, 0, 100);
          return 'Sergeant Wick received the ruling in silence, folded it into a paper boat, and floated it down the gutter past the recruiting office. The story travels. (−4 order everywhere)';
        },
      },
    ],
  },
  {
    id: 'emberFlare',
    title: 'The Site Burns Bright',
    weight: 3,
    cooldown: 6,
    when: (state, pid) => {
      const p = provincesOf(state, pid).find((pp) => pp.site === 'embersite');
      return p ? { province: p.id, heroId: null } : null;
    },
    text: (ctx) => `The ember-site at ${prov(ctx).name} has flared in the night — light standing off the ground like wheat. The adepts call it a harvest. The villagers call it a warning. Both keep their distance and watch you.`,
    choices: [
      {
        label: 'Harvest the flare',
        preview: '+12 Emberlight now; −5 order here (the villages fear the light).',
        aiScore: (p) => 3 + p.mysticism * 6,
        apply: (ctx) => {
          player(ctx).emberlight = Math.min(999, player(ctx).emberlight + 12);
          prov(ctx).order = clamp(prov(ctx).order - 5, 0, 100);
          return 'The adepts walked the burning rows with jars and hymns. The take was magnificent; the village shutters stayed closed for a week. (+12 Emberlight, −5 order)';
        },
      },
      {
        label: 'Ward it and wait',
        preview: '+4 Emberlight; +3 order here.',
        aiScore: (p) => 3 + p.loyalty * 3,
        apply: (ctx) => {
          player(ctx).emberlight = Math.min(999, player(ctx).emberlight + 4);
          prov(ctx).order = clamp(prov(ctx).order + 3, 0, 100);
          return 'Wardstones went up and the flare settled like a banked fire. The village took it as protection, correctly. (+4 Emberlight, +3 order)';
        },
      },
    ],
  },
  {
    id: 'crookedReeve',
    title: 'The Reeve With Two Ledgers',
    weight: 3,
    cooldown: 6,
    when: (state, pid) => {
      const p = richestProvince(state, pid);
      return p && p.order < 70 ? { province: p.id, heroId: null } : null;
    },
    text: (ctx) => `Your reeve in ${prov(ctx).name} keeps two ledgers: a thin one for you and a fat one for himself. The evidence is a bribe-taker's diary of superb thoroughness. Half the district is implicated; the other half wrote the diary.`,
    choices: [
      {
        label: 'Hang the ledger, spare the man — take the fat one',
        preview: '+80 gold (his hoard); −2 order here.',
        aiScore: (p) => 3 + p.greed * 5,
        apply: (ctx) => {
          player(ctx).gold += 80;
          prov(ctx).order = clamp(prov(ctx).order - 2, 0, 100);
          return 'The hoard came to the treasury; the reeve came to an arrangement. The district concluded that theft is a licensing matter. (+80 gold, −2 order)';
        },
      },
      {
        label: 'Public trial, full restitution',
        preview: '+30 gold; +7 order here.',
        aiScore: (p) => 3 + p.loyalty * 5,
        apply: (ctx) => {
          player(ctx).gold += 30;
          prov(ctx).order = clamp(prov(ctx).order + 7, 0, 100);
          return 'The trial ran three days and sold out the gallery. Restitution was paid in public, coin by coin, to a drumbeat of civic joy. (+30 gold, +7 order)';
        },
      },
    ],
  },
  {
    id: 'relicPeddler',
    title: 'A Peddler of Improbable Provenance',
    weight: 2,
    cooldown: 8,
    when: (state, pid) => {
      const p = provincesOf(state, pid)[0];
      return p && state.turn > 4 ? { province: p.id, heroId: null } : null;
    },
    text: () => `A peddler with excellent teeth and a cart of "certified relics" requests an audience. Among the brass junk, one piece hums when your back is turned. His price for the lot is outrageous. For that one piece, merely steep.`,
    choices: [
      {
        label: 'Buy the humming piece (100 gold)',
        preview: '−100 gold; 65% a true artifact, 35% worthless brass.',
        aiScore: (p, ctx) => (player(ctx).gold > 220 ? 2 + p.mysticism * 5 : 0),
        apply: (ctx) => {
          player(ctx).gold -= 100;
          if (ctx.rng.chance(0.65)) {
            const taken = artifactDefIdsInPlay(ctx.state);
            const pool = QUEST_ARTIFACTS.filter((id) => !taken.has(id));
            if (pool.length > 0) {
              const defId = ctx.rng.pick(pool);
              const artId = grantArtifactTo(ctx.state, ctx.pid, defId);
              ctx.effects.push({ e: 'artifactFound', artifactId: artId, by: ctx.pid });
              return `Under the brass plating: ${ARTIFACTS[defId].name}, old as the realm and annoyed about the plating. The peddler was gone before it was verified, which itself verifies something. (artifact gained)`;
            }
          }
          return 'Under the brass plating: more brass. Somewhere on the road, a peddler with excellent teeth is singing. (−100 gold, a lesson)';
        },
      },
      {
        label: 'Confiscate the cart',
        preview: '+25 gold in brass; your heroes gain no respect for it. −3 order here (merchants take note).',
        aiScore: (p) => 1 + p.greed * 3 + (1 - p.loyalty) * 2,
        apply: (ctx) => {
          player(ctx).gold += 25;
          prov(ctx).order = clamp(prov(ctx).order - 3, 0, 100);
          return 'The cart was seized for the crown. It was, of course, entirely brass by the time it was inventoried — the humming piece had made other arrangements. (+25 gold, −3 order)';
        },
      },
      {
        label: 'Send him on his way',
        preview: 'No cost, no risk, no hum.',
        aiScore: () => 3,
        apply: () => 'The peddler bowed himself out, complimenting the guards\' boots individually. The hum went with him. Some doors are best left on their hinges.',
      },
    ],
  },
  {
    id: 'rebelAmnesty',
    title: 'An Offer From the Straw Crown',
    weight: 4,
    cooldown: 4,
    when: (state, pid) => {
      const rebelArmy = Object.values(state.armies).find(
        (a) => a.owner === NEUTRAL && a.kind === 'rebels' && state.provinces[a.province].owner === pid,
      );
      return rebelArmy ? { province: rebelArmy.province, heroId: null } : null;
    },
    text: (ctx) => `The rebels camped in ${prov(ctx).name} send terms under a straw crown: amnesty, bread, and the hanging of exactly one tax-clerk of their choosing, and they will go home. Your marshals call it weakness. Your granaries call it arithmetic.`,
    choices: [
      {
        label: 'Grant the amnesty (30 gold in bread)',
        preview: '−30 gold; the rebel band disbands; +6 order here.',
        aiScore: (p) => 3 + p.loyalty * 4 - p.pride * 2,
        apply: (ctx) => {
          player(ctx).gold = Math.max(0, player(ctx).gold - 30);
          for (const a of Object.values(ctx.state.armies)) {
            if (a.owner === NEUTRAL && a.kind === 'rebels' && a.province === ctx.province) {
              delete ctx.state.armies[a.id];
              break;
            }
          }
          prov(ctx).order = clamp(prov(ctx).order + 6, 0, 100);
          return 'Amnesty was cried at the market cross. The rebels ate, wept, surrendered the straw crown for burning, and went home to their fields. The tax-clerk retired preemptively. (rebellion ends)';
        },
      },
      {
        label: 'No terms with traitors',
        preview: 'No cost. The rebellion continues; rebels fight harder (+1 company).',
        aiScore: (p) => 2 + p.pride * 4 + p.aggression * 2,
        apply: (ctx) => {
          for (const a of Object.values(ctx.state.armies)) {
            if (a.owner === NEUTRAL && a.kind === 'rebels' && a.province === ctx.province) {
              a.units.push(...makeUnits('rebels', 1));
              break;
            }
          }
          return 'The straw crown came back with the messenger\'s refusal pinned to it — and by week\'s end, new recruits under it. Defiance, it turns out, advertises. (+1 rebel company)';
        },
      },
    ],
  },
  {
    id: 'heroRivalry',
    title: 'Steel Between Friends',
    weight: 2,
    cooldown: 9,
    when: (state, pid) => {
      const ready = heroesOf(state, pid).filter((h) => h.status === 'ready');
      return ready.length >= 2 ? { province: ready[0].province, heroId: ready[0].id } : null;
    },
    text: (ctx) => {
      const ready = heroesOf(ctx.state, ctx.pid).filter((h) => h.status === 'ready');
      const [a, b] = ready;
      return `${a.name} and ${b.name} have quarreled — over precedence, over a map, allegedly over a goose — and the court has chosen sides. They demand the old remedy: a public bout, first blood, winner keeps the argument.`;
    },
    choices: [
      {
        label: 'Let them fight',
        preview: 'Both heroes gain experience; the loser risks a short wound. The court loves it (+3 order at their province).',
        aiScore: (p) => 3 + p.aggression * 3 + p.pride * 2,
        apply: (ctx) => {
          const ready = heroesOf(ctx.state, ctx.pid).filter((h) => h.status === 'ready');
          const [a, b] = ready;
          const winner = ctx.rng.chance(a.might / Math.max(1, a.might + b.might)) ? a : b;
          const loser = winner === a ? b : a;
          grantXp(winner, ctx.rng, 40);
          grantXp(loser, ctx.rng, 25);
          if (ctx.rng.chance(0.35)) woundHero(loser, 1);
          const where = ctx.state.provinces[a.province];
          where.order = clamp(where.order + 3, 0, 100);
          return `The bout ran nine passes before ${winner.name} took first blood, and the two embraced to a roar that lifted roof-tiles. The goose was not mentioned again. (both gained experience)`;
        },
      },
      {
        label: 'Forbid it',
        preview: 'No bout. The quarrel curdles quietly; nothing else happens.',
        aiScore: (p) => 2 + p.loyalty * 2,
        apply: () => 'The bout was forbidden and the quarrel retired to the long game of seating arrangements and pointed toasts. Courts survive worse.',
      },
    ],
  },
  {
    id: 'chroniclerAsks',
    title: 'The Chronicler Requests a Word',
    weight: 1,
    once: true,
    cooldown: 99,
    when: (state, pid) => {
      const p = provincesOf(state, pid).find((pp) => pp.seatOf === pid);
      return p && state.turn > 10 ? { province: p.id, heroId: null } : null;
    },
    text: () => `A cold spot manifests in your map room at midnight, politely. Quill-scratch on empty air; a smell of old paper and older smoke. Osperan the Unresting — for it can be no one else — has one question for the chronicle: "Why do you want the throne?"`,
    choices: [
      {
        label: '"To warm the realm."',
        preview: 'He writes it down. +2 order in every province you rule.',
        aiScore: (p) => 2 + p.loyalty * 4,
        apply: (ctx) => {
          for (const p of provincesOf(ctx.state, ctx.pid)) p.order = clamp(p.order + 2, 0, 100);
          return 'The quill-scratch paused. "That is what the last one said," the cold spot murmured, "and for a while it was even true." The page turned gently. Word of the visitation spread, and oddly, it comforted people. (+2 order everywhere)';
        },
      },
      {
        label: '"Because it is mine."',
        preview: 'He writes it down. +40 gold arrives mysteriously (an old royal cache, footnoted).',
        aiScore: (p) => 2 + p.pride * 4,
        apply: (ctx) => {
          player(ctx).gold += 40;
          return '"Ah," said the cold spot, in the tone of a man underlining something. By morning, a forgotten royal cache had been "found" behind the map-room panelling, with a bookmark in it. (+40 gold)';
        },
      },
      {
        label: 'Say nothing',
        preview: 'He writes that down too. Nothing else happens — probably.',
        aiScore: () => 1,
        apply: () => 'The silence stretched. The quill scratched anyway — longer than a silence should take to transcribe. The cold spot withdrew, satisfied with whatever it heard in the quiet.',
      },
    ],
  },
  {
    id: 'wolfsheadUltimatum',
    title: 'The Toll of the Low Road',
    weight: 2,
    cooldown: 6,
    when: (state, pid) => {
      const band = Object.values(state.armies).find(
        (a) => a.owner === NEUTRAL && a.kind === 'marauders' &&
          state.provinces[a.province].neighbors.some((n) => state.provinces[n].owner === pid),
      );
      return band ? { province: band.province, heroId: null } : null;
    },
    text: (ctx) => `The wolfshead band lairing in ${prov(ctx).name} sends a bill: fifty gold per season, itemized as "road maintenance," and your wagons pass unmolested. The handwriting is excellent. Mercenary scribes are apparently affordable.`,
    choices: [
      {
        label: 'Pay the toll (50 gold)',
        preview: '−50 gold; this band never raids your lands (marked).',
        aiScore: (p, ctx) => (player(ctx).gold > 150 ? 2 + (1 - p.pride) * 4 : 0),
        apply: (ctx) => {
          player(ctx).gold = Math.max(0, player(ctx).gold - 50);
          for (const a of Object.values(ctx.state.armies)) {
            if (a.owner === NEUTRAL && a.kind === 'marauders' && a.province === ctx.province) {
              player(ctx).flags[`tollPaid:${a.id}`] = true;
              break;
            }
          }
          return 'The toll was paid under a flag of commerce. The wolfsheads keep their word with the fastidiousness of men who have only one asset left. (this band will not raid you)';
        },
      },
      {
        label: 'Answer with a bounty',
        preview: 'No cost now. The band grows bolder (+1 company) but every lord\'s hunters know their lair.',
        aiScore: (p) => 3 + p.pride * 3 + p.aggression * 2,
        apply: (ctx) => {
          for (const a of Object.values(ctx.state.armies)) {
            if (a.owner === NEUTRAL && a.kind === 'marauders' && a.province === ctx.province) {
              a.units.push(...makeUnits('marauders', 1));
              break;
            }
          }
          return 'The bill came back marked PAST DUE with a bounty notice attached. The wolfsheads recruited on the insult — but their lair is marked on every honest map now. (+1 marauder company)';
        },
      },
    ],
  },
  {
    id: 'creedFriction',
    title: 'The Old Ways and the New',
    weight: 3,
    cooldown: 6,
    when: (state, pid) => {
      const lord = lordOf(state.players[pid]);
      const p = provincesOf(state, pid).find((pp) => pp.folk !== lord.creed && pp.order < 55);
      return p ? { province: p.id, heroId: null } : null;
    },
    text: (ctx) => `The folk of ${prov(ctx).name} keep a different creed from their lord, and it is festival season. Your local priests want the rival festival curtailed. The folk want their lord to come and eat the ceremonial bread, which is, by all accounts, terrible.`,
    choices: [
      {
        label: 'Attend and eat the bread',
        preview: '+8 order here; the folk creed remains their own.',
        aiScore: (p) => 4 + p.loyalty * 4 - p.pride * 2,
        apply: (ctx) => {
          prov(ctx).order = clamp(prov(ctx).order + 8, 0, 100);
          return 'The bread was as advertised, and eaten entire, with seconds. The province talked of nothing else for a month. Rule is mostly showing up and chewing. (+8 order)';
        },
      },
      {
        label: 'Curtail the festival',
        preview: '−6 order here now; the folk adopt your creed within a season (mismatch penalty ends).',
        aiScore: (p) => 2 + p.pride * 3,
        apply: (ctx) => {
          prov(ctx).order = clamp(prov(ctx).order - 6, 0, 100);
          prov(ctx).folk = lordOf(player(ctx)).creed;
          return 'The festival was curtailed to a procession, the procession to a queue, the queue to a grievance. The folk conform now — outwardly, which is the layer taxes come from. (−6 order, creed conforms)';
        },
      },
    ],
  },
  {
    id: 'guildLoan',
    title: 'The Counting-House Proposal',
    weight: 2,
    cooldown: 10,
    when: (state, pid) => {
      const player = state.players[pid];
      const p = provincesOf(state, pid).find((pp) => pp.buildings.includes('market'));
      return p && player.gold < 200 && !player.flags.guildLoanOut ? { province: p.id, heroId: null } : null;
    },
    text: () => `The Honourable Guild of Weights and Measures — which measures, among other things, opportunity — offers the crown a loan: 180 gold now against 240 within six seasons, secured by "reputational considerations." The clerk smiles like a closing ledger.`,
    choices: [
      {
        label: 'Take the loan',
        preview: '+180 gold now; owe 240 in 6 rounds or every province loses 5 order (default marked).',
        aiScore: (p, ctx) => (player(ctx).gold < 100 ? 4 + p.greed * 3 : 1),
        apply: (ctx) => {
          player(ctx).gold += 180;
          player(ctx).flags.guildLoanOut = true;
          player(ctx).flags[`guildLoanDue:${ctx.state.turn + 6}`] = true;
          return 'The gold arrived in guild-sealed chests before the ink dried. Six seasons. The clerk\'s smile said he knew wars run long. (+180 gold, 240 due)';
        },
      },
      {
        label: 'Decline politely',
        preview: 'No loan, no debt, no smile.',
        aiScore: () => 3,
        apply: () => 'The clerk bowed, unsurprised — declined offers are also entered in the guild\'s books, under a column nobody outside has read.',
      },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
