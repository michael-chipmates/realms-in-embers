/**
 * The quest book. Tiers: Ember (low), Silver (real), Blood (deadly).
 * Outcome text is written per quest — a quest report should read like a
 * page of the chronicle, not a dice result.
 *
 * The Grand Saga (saga 1..5) is the Legend victory: one chain, open to every
 * claimant, culminating in the Rekindling.
 */
import type { SiteType } from '../types';

export type QuestStat = 'might' | 'lore' | 'guile';

export interface QuestRewards {
  xp: number;
  gold?: [number, number];
  emberlight?: number;
  /** Chance 0..1 of an artifact from the pool. */
  artifactChance?: number;
  /** Learn a random unlearned spell on success. */
  spell?: boolean;
  /** Order gained in the quest province. */
  order?: number;
  /** Specific artifact granted (saga shards). */
  grantArtifact?: string;
}

export interface QuestDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  site: SiteType | 'ownSeat' | null;
  stat: QuestStat;
  dc: number;
  duration: number;
  minLevel?: number;
  /** Realm-strength gate: the Saga's later chapters demand a realm behind
   * the legend, so the fastest path cannot also be the smallest. */
  minProvinces?: number;
  saga?: 1 | 2 | 3 | 4 | 5;
  rewards: QuestRewards;
  desc: string;
  /** One line or several — arrays are picked from, avoiding recent repeats,
   * so re-run quests read fresh over a long campaign. */
  outcomes: {
    triumph: string | string[];
    success: string | string[];
    setback: string | string[];
    disaster: string | string[];
  };
}

export const TIER_NAMES = ['', 'Ember', 'Silver', 'Blood'] as const;
/** Death risk on disaster, by tier. */
export const TIER_DEATH_RISK = [0, 0.08, 0.18, 0.3] as const;

export const QUESTS: Record<string, QuestDef> = {
  // ------------------------------------------------------------- tier 1
  wolfCull: {
    id: 'wolfCull', name: 'The Wolfshead Bounty', tier: 1, site: null, stat: 'might', dc: 8, duration: 2,
    rewards: { xp: 30, gold: [30, 60], order: 4 },
    desc: 'Outlawed soldiery bleed the roads here. The village reeves have pooled a bounty and their patience.',
    outcomes: {
      triumph: [
        '{hero} broke the wolfshead camp at dawn and marched their captain home tied to his own standard. The roads are safe and the ballads have already started.',
        'The wolfsheads had a watchword, a back gate, and a plan. {hero} had a dawn, a horse, and no patience for any of it. The bounty was paid by noon.',
        '{hero} found the camp by its cookfire smoke and ended the enterprise before breakfast. The reeves paid the bounty and threw in the good ale, unprompted, which has never happened before.',
      ],
      success: [
        '{hero} scattered the wolfsheads after a hard chase through the hedgerows. The bounty was paid with real gratitude and counterfeit reluctance.',
        '{hero} broke three ambushes in a week until the wolfsheads discovered urgent business elsewhere. The roads breathe again.',
        'It took {hero} nine days and two informants of negotiable honesty, but the band is scattered and the bounty banked.',
      ],
      setback: [
        '{hero} walked into a staged ambush and came home lighter one horse and some blood. The wolfsheads are laughing. For now.',
        'The wolfsheads knew the hedgerows better than the hedges did. {hero} came home with a torn cloak and a shorter temper.',
        '{hero} caught four wolfsheads; the other forty declined to be caught. The reeves paid a fraction of the bounty with the whole of their regret.',
      ],
      disaster: [
        'The bounty was bait — the wolfsheads bought the reeve first. {hero} fought clear of the trap at terrible cost.',
        'The camp {hero} stormed was a decoy; the real band was behind them the whole while. The withdrawal is called, charitably, a lesson.',
        'A crossbow in a hedge does not care for reputations. {hero} was carried the last mile home, and the wolfsheads drank to their own daring.',
      ],
    },
  },
  tithesLost: {
    id: 'tithesLost', name: 'The Vanished Tithes', tier: 1, site: null, stat: 'guile', dc: 8, duration: 2,
    rewards: { xp: 28, gold: [40, 80] },
    desc: 'Three seasons of tithes never reached the counting-house. Somebody local is suddenly fond of silver buttons.',
    outcomes: {
      triumph: [
        '{hero} followed the buttons to a false-bottomed hay wain and recovered the tithes entire — plus interest, plus the wain.',
        'The silver came home in the same wain that stole it, driven by {hero}, whistling. The buttons were returned to their coat, and the coat to a cell.',
        '{hero} audited three parishes with a smile and a knife-point pen. The tithes surfaced from a false grave, and the thief at his own confession, weeping over the arithmetic.',
      ],
      success: [
        '{hero} recovered most of the silver and extracted a confession remarkable chiefly for its spelling.',
        '{hero} recovered the bulk of the tithes from under a chapel floor. What is still missing is being repaid in labor, sermon attendance, and shame.',
        'Most of the silver came back; the rest bought the district a lesson in bookkeeping it will not soon forget. {hero} kept the receipts.',
      ],
      setback: [
        'The trail led through three parishes and died in a bog. {hero} returned with sore feet and one silver button.',
        'Whoever took the tithes counts better than they steal. {hero} chased clean ledgers in circles for a fortnight and came home with a headache.',
        'The buttons led {hero} to a peddler, the peddler to a boatman, the boatman to open water. The trail is drowned; the silver, presumably, is dry.',
      ],
      disaster: [
        'The thieves were better connected than expected — and expecting {hero}. It went badly in a cellar.',
        'The theft had patrons, and the patrons had knives. {hero} learned both facts in the same cellar and was fortunate to leave with only the lesson.',
        '{hero} named the thief at market and was answered by the thief\'s cousins — all of them, at once. The tithes remain a local joke with a body count.',
      ],
    },
  },
  shrineVigil: {
    id: 'shrineVigil', name: 'The Long Vigil', tier: 1, site: 'shrine', stat: 'lore', dc: 8, duration: 2,
    rewards: { xp: 30, order: 6, emberlight: 4 },
    desc: 'The wayshrine has gone dark and the pilgrims uneasy. Someone of substance must keep the old vigil, one night, alone.',
    outcomes: {
      triumph: [
        '{hero} kept the vigil and something kept it back. At dawn the shrine-flame stood tall and blue, and the pilgrims wept.',
        'At midnight the dark leaned close, and {hero} read to it, calmly, from the rite-book. By the third page it was listening. By dawn it was gone, and the flame stood tall.',
        '{hero} kept the vigil with such stillness that the pilgrims swore two statues stood the night. One statue walked down at dawn; the flame has never burned steadier.',
      ],
      success: [
        '{hero} sat the night through — cold, whispered-at, unmoved. The flame returned, small but honest.',
        'The night asked its usual fees — warmth, certainty, the hours before dawn. {hero} paid without complaint, and the shrine-flame took.',
        '{hero} answered nothing the dark whispered, all night. Silence, it turns out, was the correct liturgy. The flame returned by morning.',
      ],
      setback: [
        'At the third hour the dark asked {hero} a question they could not answer. The flame returned, but the hero left something in that silence.',
        'Toward dawn {hero} nodded — a heartbeat only, but the dark keeps strict accounts. The flame returned grudging and low.',
        'The vigil held, mostly. {hero} does not speak of the fourth hour, and has taken to sleeping with a lamp lit, which is its own kind of report.',
      ],
      disaster: [
        'What waited at the shrine was older than the rite meant to soothe it. {hero} barely came down the hill.',
        'Whatever holds the deed to that hill attended in person. {hero} survived the introduction; the rite-book did not.',
        'The pilgrims found {hero} at the shrine door at dawn, upright, unmoving, and unwilling to turn around. The flame is lit. Nobody asks what lit it.',
      ],
    },
  },
  surveyorsMaps: {
    id: 'surveyorsMaps', name: "The Surveyor's Debt", tier: 1, site: null, stat: 'guile', dc: 9, duration: 2,
    rewards: { xp: 26, gold: [20, 40], order: 5 },
    desc: 'The old boundary stones have wandered — some by frost, some by night, all profitably for somebody. Walk the marches and set them true.',
    outcomes: {
      triumph: [
        '{hero} reset every stone, settled four feuds, and married off two of the feuding parties to each other. The district is scandalized and content.',
        '{hero} produced the original charters and read them aloud in three villages, moving the stones back while the owners watched each other. There has not been a quieter market-day in years.',
        'Every stone stands true, every fence agrees with every deed, and two magistrates are out of work. {hero} is owed drinks in four parishes and collects methodically.',
      ],
      success: [
        '{hero} walked the bounds and set them right. Grumbling continues at the customary background level.',
        'The marches are walked, the stones reset, the worst liars fined a sheep apiece. {hero} calls it a fair season\'s work; the sheep reserve judgment.',
        '{hero} settled the bounds with chain, charter, and a firm look. The frost will move the stones again; the neighbors, for a while, will not.',
      ],
      setback: [
        'Two families produced rival charters, a genealogy, and cudgels. {hero} withdrew to reconsider the cartography.',
        'The survey uncovered a fourth feud beneath the other three, older and better armed. {hero} withdrew to advise that the district needs a garrison or a flood.',
        'Half the stones are set true. The other half are in a pond, along with, briefly, {hero}. The cartography continues.',
      ],
      disaster: [
        'The boundary feud turned to blood with {hero} in the middle of it. The stones stand where they stood; the hero did not.',
        'A boundary is a line people agree not to kill over, and the agreement failed with {hero} standing on it. The stones will keep. The scars will too.',
        'The feuding houses united at last — against the surveyor. {hero} left the district by night, unpaid, pursued, and cured of optimism about property.',
      ],
    },
  },
  // ------------------------------------------------------------- tier 2
  ruinDelve: {
    id: 'ruinDelve', name: 'Into the Roofless Halls', tier: 2, site: 'ruin', stat: 'guile', dc: 11, duration: 3,
    rewards: { xp: 55, gold: [30, 70], artifactChance: 0.65 },
    desc: 'The old halls predate the realm and outlasted it. Lights move on the stairs at dusk. Down there is history — the valuable, biting kind.',
    outcomes: {
      triumph: [
        '{hero} went down three stairs history forgot and came back with treasure and every finger. The lights on the stairs have stopped; possibly out of respect.',
        'Three levels down, past the liars\' mosaic and the stair that counts, {hero} found the old realm\'s strongroom still locked. It is not locked now.',
      ],
      success: [
        '{hero} mapped the upper halls, dodged what hunts there, and returned with a find worth the naming.',
        '{hero} came up at dusk with a pack full of history and eyes that needed a fire. The finds will fund arguments among scholars for years.',
      ],
      setback: [
        'The floor of the second hall was a lie. {hero} climbed out days later, bruised, empty-handed, and extensively opinionated about masonry.',
        'The halls rearranged themselves politely around {hero} until every stair led up. The delve is postponed; the ruin seems content.',
      ],
      disaster: [
        'Something in the deep halls closed the way behind {hero}. What came back up wore its wounds like an inventory.',
        'The lights on the stairs went out one by one as {hero} watched — from below. The climb back cost what climbs back always cost.',
      ],
    },
  },
  barrowHush: {
    id: 'barrowHush', name: 'Quieting the Barrow', tier: 2, site: 'barrow', stat: 'might', dc: 11, duration: 3,
    rewards: { xp: 60, order: 8, artifactChance: 0.4 },
    desc: 'The mounds have begun to hum at moonrise and the cattle refuse the whole valley. The old rites are half-remembered. The other half will have to be improvised.',
    outcomes: {
      triumph: [
        '{hero} stood on the king-mound at moonrise and argued the dead back to bed in their own tongue. The valley sleeps. The cattle returned first.',
        'The dead asked for the old songs; {hero} knew all nine verses, including the rude one. The mounds settled, satisfied, like grandfathers after supper.',
      ],
      success: [
        '{hero} restored the rites with steel where memory failed. The humming stopped; the bruises will fade.',
        'The rites held at the third attempt. {hero} left the offerings arranged the old way and did not look back, which is also part of the rite.',
      ],
      setback: [
        'The barrow answered the rites with a counter-offer. {hero} declined it, expensively.',
        'The barrow accepted the rites and kept {hero}\'s sword as a deposit against future noise. The humming has stopped. Mostly.',
      ],
      disaster: [
        'The mound opened. What {hero} fought under the earth kept its toll — the valley is quiet now, at a price nobody will say aloud.',
        'What rose at moonrise had been a king and remembered it. {hero} survived the audience; the valley pays a new tax now, in silence, at each full moon.',
      ],
    },
  },
  emberTending: {
    id: 'emberTending', name: 'The Flaring Shard', tier: 2, site: 'embersite', stat: 'lore', dc: 11, duration: 3,
    rewards: { xp: 55, emberlight: 14 },
    desc: 'The ember-site burns too bright — glass in the soil, dreams catching fire nearby. Untended, it will gutter out or worse. Tended, it is a wellspring.',
    outcomes: {
      triumph: [
        '{hero} banked the shard-fire like a master smith and it settled into a steady, giving warmth. The nearby village reports pleasant dreams and softer winters.',
        '{hero} spoke to the shard-fire the way smiths speak to iron — firmly, respectfully, with gloves. It banked itself to a loyal glow that follows visitors to the lane\'s end, like a dog.',
      ],
      success: [
        '{hero} calmed the flare and carried home jars of caught light, only slightly singed.',
        'The flare yielded to {hero}\'s tending over three careful nights. The caught light travels home in sealed jars, humming faintly against the straw.',
      ],
      setback: [
        'The shard spat. {hero} saved the village and lost their eyebrows and the harvest of light.',
        'The shard flared once more as {hero} turned to go — spite or farewell, the adepts still argue. The light-harvest was lost; the village was not, which is the better ledger.',
      ],
      disaster: [
        'The flare ran up {hero}\'s arm like a living thing arguing for a new tenant. It was put out. Not easily.',
        'The fire wanted a keeper and auditioned {hero} without consent. The burns will heal. The dreams, the adepts say, take longer.',
      ],
    },
  },
  circleRiddle: {
    id: 'circleRiddle', name: 'The Standing Question', tier: 2, site: 'circle', stat: 'lore', dc: 12, duration: 3,
    rewards: { xp: 60, spell: true },
    desc: 'Once a generation the stones ask their question of whoever dares stand the circle at dusk. Wrong answers walk home. Right answers are taught something.',
    outcomes: {
      triumph: [
        '{hero} answered before the question finished — insolent, correct. The stones taught them a working the realm has not seen since the Sundering.',
        'The stones asked; {hero} answered with a better question. There was a pause of some geological length, and then the circle, amused, paid double.',
      ],
      success: [
        '{hero} stood the circle, sweated the riddle, and answered true. The stones kept their bargain.',
        'The question took all night to ask and a heartbeat to answer. {hero} walked out at dawn carrying a working like a lit candle in cupped hands.',
      ],
      setback: [
        '{hero} answered wrong and the circle showed them, at length, exactly how wrong. They walked home wiser and limping.',
        'The stones found {hero}\'s answer honest, wrong, and funny. They kept the working and left the limp as a memorandum.',
      ],
      disaster: [
        'The stones judged the answer an insult. The circle is patient; {hero}\'s recovery will be too.',
        'Some answers offend by being close. The circle held {hero} until moonset, and what it said in that time is not in any rite-book anyone will open.',
      ],
    },
  },
  forgeEmbers: {
    id: 'forgeEmbers', name: 'The Cold Anvil', tier: 2, site: 'forge', stat: 'might', dc: 11, duration: 3,
    rewards: { xp: 55, artifactChance: 0.7, gold: [10, 30] },
    desc: 'The ancient forge has one chamber never reopened since the Sundering. The door is warm. Doors should not be warm.',
    outcomes: {
      triumph: [
        '{hero} forced the warm door and found the smith\'s last work laid out as if awaiting collection. Collected.',
        'The warm door opened for {hero} as if expected. On the anvil: the smith\'s last commission, finished, signed in cooled fire, and addressed — the adepts swear — to the bearer.',
      ],
      success: [
        '{hero} cleared the chamber of what had moved in and salvaged fine old work from the racks.',
        'What nested in the chamber objected to eviction; {hero} out-argued it with a shield-edge. The racks yielded fine steel and one hammer nobody lifts casually.',
      ],
      setback: [
        'The chamber\'s keeper — all cinders and grudge — threw {hero} out through a wall. The door is shut again. Warmer.',
        'The chamber\'s keeper accepted neither rite nor reason, and {hero} left through the second-best exit. The door has grown warmer. The village smith has grown religious.',
      ],
      disaster: [
        'The forge remembered being betrayed and made its case with fire. {hero} was carried out by the boots.',
        'The forge lit itself as {hero} crossed the threshold, and the old bellows drew breath without hands. The account of what followed was given from a litter, in fragments.',
      ],
    },
  },
  // ------------------------------------------------------------- tier 3
  kingsRansom: {
    id: 'kingsRansom', name: "The King's Ransom", tier: 3, site: null, stat: 'guile', dc: 14, duration: 3,
    rewards: { xp: 90, gold: [140, 240] },
    desc: 'A war-chest from the old kingdom — twice stolen, currently guarded by professionals in a place nobody respectable admits knowing. Steal it a third time, for the righteous cause of your treasury.',
    outcomes: {
      triumph: '{hero} lifted the ransom without waking a soul and left a receipt out of pure artistic spite.',
      success: '{hero} got the chest out two steps ahead of the alarm and one ahead of the dogs. The counting-house is delighted; the dogs, hoarse.',
      setback: 'The professionals were expecting professionals. {hero} escaped with their life, their pride pending recovery.',
      disaster: 'It was a counting-house in front and a killing-floor behind. {hero} paid the difference.',
    },
  },
  wyrmOfTheMere: {
    id: 'wyrmOfTheMere', name: 'The Wyrm of the Mere', tier: 3, site: null, stat: 'might', dc: 14, duration: 4,
    minLevel: 4,
    rewards: { xp: 110, artifactChance: 0.8, order: 6 },
    desc: 'Something long and patient has moved into the deep water and begun collecting livestock, boats, and a tax collector. The fens want their mere back.',
    outcomes: {
      triumph: '{hero} met the wyrm in the shallows at low mist and ended the argument permanently. The fens will drink out on this story for thirty years.',
      success: '{hero} drove the wyrm from the mere after a fight that rearranged the shoreline. It will not be back; parts of it stayed.',
      setback: 'The wyrm was older and colder than the stories. {hero} withdrew with wounds and notes for a second attempt.',
      disaster: 'The mere kept its secret and very nearly kept {hero}. What crawled ashore needed carrying.',
    },
  },
  crownPretender: {
    id: 'crownPretender', name: 'The Man Who Would Be Ember', tier: 3, site: null, stat: 'guile', dc: 13, duration: 3,
    rewards: { xp: 85, gold: [60, 120], order: 10 },
    desc: 'A silver-tongued pretender tours the villages wearing "the recovered Ember Crown" — brass — and collecting oaths. Expose the fraud before the oaths harden.',
    outcomes: {
      triumph: '{hero} unmasked the pretender at his own coronation feast, mid-toast, with his real ledgers. The crowd kept the feast and lost the faith.',
      success: '{hero} traced the brass crown to its smith and paraded the receipts. The movement dissolved into embarrassed farming.',
      setback: 'The pretender talked his way out of {hero}\'s trap and into greater fame. He sends his regards, insufferably.',
      disaster: 'The pretender\'s oath-sworn turned on {hero} with the sincerity of the recently converted. It took knives to leave.',
    },
  },
  starfallIron: {
    id: 'starfallIron', name: 'The Iron That Fell', tier: 3, site: null, stat: 'might', dc: 14, duration: 4,
    minLevel: 4,
    rewards: { xp: 100, artifactChance: 1 },
    desc: 'A star came down in the high country and everything lawless within fifty miles is converging on the crater. Whatever cooled in that hole will be spoken for by nightfall. Speak first.',
    outcomes: {
      triumph: '{hero} held the crater rim alone until the moon set, then walked out with star-iron on their back and legend at their heels.',
      success: '{hero} won the scramble for the crater and came home with iron worth a province\'s taxes.',
      setback: 'Three bands reached the crater together and {hero} left the mathematics early, bleeding.',
      disaster: 'The crater was a lodestone for every blade in the marches. {hero} was carried off it.',
    },
  },
  // ---------------------------------------------------------- the saga
  sagaColdTrail: {
    id: 'sagaColdTrail', name: 'Saga I — The Cold Trail', tier: 2, site: 'ruin', stat: 'guile', dc: 11, duration: 3,
    saga: 1, minLevel: 2,
    rewards: { xp: 70 },
    desc: 'The Chronicle holds that the Ember Throne broke into shards, and the shards into rumours. The oldest rumour sleeps in these ruins: the ledger of the palace salvagers, who looted the throne room before the ash settled.',
    outcomes: {
      triumph: '{hero} found the salvagers\' ledger sealed in wax beneath a fallen lintel — names, routes, and the fates of the shards, written in a dead clerk\'s beautiful hand. The Saga has begun.',
      success: '{hero} pieced the salvagers\' trail from scratched tally-marks and one skeleton\'s pocketbook. The shards are real, and findable. The Saga has begun.',
      setback: 'The ruin gave up nothing but false floors and old bones. The trail is here; it wants more patience or more blood.',
      disaster: 'Someone else guards the salvagers\' secret still, and they met {hero} in the dark below. The trail stays cold; the wounds do not.',
    },
  },
  sagaFirstShard: {
    id: 'sagaFirstShard', name: 'Saga II — The Morning Shard', tier: 2, site: 'embersite', stat: 'lore', dc: 12, duration: 3,
    saga: 2, minLevel: 3,
    rewards: { xp: 85, grantArtifact: 'shardOfMorning' },
    desc: 'The ledger names this burning ground: here a salvager buried what he could not bear to sell — a shard of the throne itself, still keeping the first fire. It has been feeding the land\'s heat for forty years. It will not want to be dug up.',
    outcomes: {
      triumph: '{hero} sang the old kindling-songs while digging and the shard came up warm and willing, like a cat changing laps. The Morning Shard is found.',
      success: '{hero} took the Morning Shard from the burning earth with scorched gloves and a level head. It glows when carried. It approves of being carried.',
      setback: 'The ground fought back with heat and visions. {hero} marked the true digging-spot and retreated to heal. The shard waits.',
      disaster: 'The shard tested {hero} with the Sundering itself, replayed nightly. They were pulled from the site raving about a crown of fire.',
    },
  },
  sagaBarrowToll: {
    id: 'sagaBarrowToll', name: 'Saga III — The Barrow-King\'s Toll', tier: 3, site: 'barrow', stat: 'might', dc: 13, duration: 3,
    saga: 3, minLevel: 4, minProvinces: 4,
    rewards: { xp: 100, grantArtifact: 'shardOfNoon' },
    desc: 'The second shard was paid to the barrow-king as toll, generations ago, by salvagers who wanted to cross his valley alive. He honours bargains. He will want a new one.',
    outcomes: {
      triumph: '{hero} offered the barrow-king a story he had never heard — the truth about the Sundering — and the old dead laughed like rockfall and paid the shard over gladly. The Noon Shard is found.',
      success: '{hero} met the barrow-king\'s champion at the threshold stone and won the shard by the old rules: loudly, bloodily, respectfully. The Noon Shard is found.',
      setback: 'The barrow-king demanded a toll {hero} would not pay. The door stands open. The offer stands. The bruises, also.',
      disaster: 'The bargaining turned to battle in the dark under the mound, and the dead do not tire. {hero} was dragged out by the heels, shardless.',
    },
  },
  sagaForge: {
    id: 'sagaForge', name: 'Saga IV — The Forge That Remembers', tier: 3, site: 'forge', stat: 'lore', dc: 14, duration: 3,
    saga: 4, minLevel: 5, minProvinces: 4,
    rewards: { xp: 120, grantArtifact: 'emberheart' },
    desc: 'Two shards, one ancient forge, and the oldest smithing-song in the realm. Reforge the heart of the throne. The forge remembers how; it requires only hands worth trusting and both shards on the anvil.',
    outcomes: {
      triumph: '{hero} laid the shards on the anvil and the forge lit itself, weeping sparks. What came off the anvil at dawn beats like a heart. Because it is one. The Emberheart is made.',
      success: 'Three days at the anvil, the old song sung until voices broke — and the shards flowed together at last. The Emberheart is made, and the forge has gone quiet, satisfied.',
      setback: 'The forge rejected the first joining and threw the shards apart. They are unharmed. The smith-song wants relearning; {hero} wants bandages.',
      disaster: 'The joining failed catastrophically — the forge roared grief through every chimney at once. {hero} saved the shards and paid in blood to do it.',
    },
  },
  sagaRekindling: {
    id: 'sagaRekindling', name: 'Saga V — The Rekindling', tier: 3, site: 'ownSeat', stat: 'lore', dc: 14, duration: 3,
    saga: 5, minLevel: 7, minProvinces: 5,
    rewards: { xp: 200 },
    desc: 'Carry the Emberheart to your own high seat and hold the three-night ritual of Rekindling. Every lord in the realm will see the glow on the horizon and know exactly what it means. Hold the seat. Finish the fire.',
    outcomes: {
      triumph: 'On the third night the Emberheart took to the hearth of {seat} like a sun coming home. The age of embers is over. The realm has a throne again — and it is yours.',
      success: 'The ritual held through storm, sabotage, and the third night\'s long doubt. The fire stands. The war is over — everything after this is coronation.',
      setback: 'The second night faltered — the fire wants more of its keeper than was given. The Emberheart is safe. The ritual can be attempted again.',
      disaster: 'The rekindling collapsed on the final night, and the backlash scoured the hall. The Emberheart endures, patient as ever. {hero} may not be.',
    },
  },
};

export const QUEST_IDS = Object.keys(QUESTS);
export const GENERIC_QUESTS = QUEST_IDS.filter((id) => !QUESTS[id].saga);
export const SAGA_QUESTS = [
  'sagaColdTrail', 'sagaFirstShard', 'sagaBarrowToll', 'sagaForge', 'sagaRekindling',
] as const;
