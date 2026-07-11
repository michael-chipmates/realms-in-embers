/**
 * The roster of claimant lords. Each game draws its rivals from here.
 * Personalities are engine inputs (the AI weights read them directly), not
 * flavor: an aggression 0.85 lord genuinely plays like one.
 */
import type { Creed, SpellFxFamily, SpellId, Terrain, UnitTypeId } from '../types';

export type SigilPattern = 'plain' | 'stripes' | 'dots' | 'checks' | 'waves' | 'crosshatch';

export interface LordPersonality {
  /** 0..1 each. */
  aggression: number;   // war appetite, attack threshold
  greed: number;        // gold focus, demands, tribute
  mysticism: number;    // emberlight, spells, rites priority
  loyalty: number;      // honors pacts, remembers gifts
  pride: number;        // reacts to demands, refuses peace when behind
}

export interface LordPerkEffects {
  buildingDiscountId?: string;
  buildingDiscountPct?: number;
  unitDiscountId?: UnitTypeId;
  unitDiscountPct?: number;
  orderAll?: number;
  incomeTerrainId?: Terrain;
  incomeTerrainAdd?: number;
  /** flat gold on top of base income in provinces with any wall building */
  walledIncomeAdd?: number;
  capitalIncomePct?: number;
  defenseTerrainId?: Terrain;
  defenseTerrainPct?: number;
  wallDiscountPct?: number;
  defendOwnPct?: number;
  atkVsCreed?: Creed;
  atkVsCreedPct?: number;
  spellDiscountPct?: number;
  startingSpell?: SpellId;
  plunderWinGold?: number;
  demandBonusPct?: number;
  harborIncomeAdd?: number;
  questGuileAdd?: number;
  discordDiscountPct?: number;
  cragguardInHills?: boolean;
  revenantsAtBarrows?: boolean;
  terrorImmune?: boolean;
  wolfsheadSafe?: boolean;
  seaMoveFree?: boolean;
}

/** The active half of a lord's identity (rules v11). The passive perk gives
 * a lord their SHAPE; the signature gives them a DECISION — an order with a
 * cooldown, announced to the whole table when it fires. Magnitudes live in
 * SIGNATURE_TUNING (engine/signature.ts); a test pins each desc to them. */
export interface LordSignature {
  id: string;
  name: string;
  /** Rules voice: what it does, exactly. */
  desc: string;
  flavor: string;
  /** Seasons between uses. */
  cooldown: number;
  target: 'none' | 'rival' | 'enemyProvince';
  fxFamily: SpellFxFamily;
}

export interface LordDef {
  id: string;
  name: string;
  epithet: string;
  creed: Creed;
  /** Two-to-three sentence portrait shown at setup and in the lords panel. */
  blurb: string;
  personality: LordPersonality;
  favoredTerrain: Terrain;
  color: string;
  colorAlt: string;
  pattern: SigilPattern;
  sigil: string;
  perk: { label: string; desc: string; fx: LordPerkEffects };
  signature: LordSignature;
  lines: {
    intro: string;
    taunt: string;
    gracious: string;
    defeat: string;
    victory: string;
  };
}

export const LORDS: LordDef[] = [
  // ---------------------------------------------------------------- FLAME
  {
    id: 'seraphine',
    name: 'Seraphine Vael',
    epithet: 'the Cinder Rose',
    creed: 'flame',
    blurb: 'Last abbess of the burned Hearthmother convent, now a claimant with a relic sword and a following that would walk into fire for her — several already have. She wars gently and governs fiercely.',
    personality: { aggression: 0.45, greed: 0.25, mysticism: 0.55, loyalty: 0.9, pride: 0.5 },
    favoredTerrain: 'meadow',
    color: '#9e2b25', colorAlt: '#e8c8a8', pattern: 'plain', sigil: 'rose',
    perk: {
      label: 'Keeper of Hearths',
      desc: 'Hearthshrines cost half. All your provinces gain +1 order each season.',
      fx: { buildingDiscountId: 'temple', buildingDiscountPct: 50, orderAll: 1 },
    },
    signature: {
      id: 'greatVigil', name: 'The Great Vigil',
      desc: 'Every province you rule gains +10 order at once, the parishes tithe 3 gold apiece, and newly conquered folk forget their grief.',
      flavor: 'One night, every hearth in the realm tended by someone who prays like she means it.',
      cooldown: 8, target: 'none', fxFamily: 'bless',
    },
    lines: {
      intro: 'The realm is cold, my lords. I intend to warm it — with hearths where possible.',
      taunt: 'I lit a candle for you. I light one for everyone I am about to ruin.',
      gracious: 'Kindness is not weakness. Test the difference at your leisure.',
      defeat: 'Keep the fires lit. That is all I ever asked of anyone.',
      victory: 'The throne is warm again. Come in from the dark, all of you.',
    },
  },
  {
    id: 'aldric',
    name: 'King Aldric Emberborn',
    epithet: 'the Twice-Crowned',
    creed: 'flame',
    blurb: 'Crowned once as a boy in exile and once by his own hand over a dead usurper. Aldric believes the Ember Throne is his by blood, and treats the war as an extended coronation.',
    personality: { aggression: 0.7, greed: 0.4, mysticism: 0.2, loyalty: 0.6, pride: 0.95 },
    favoredTerrain: 'meadow',
    color: '#b8860b', colorAlt: '#3a2c14', pattern: 'checks', sigil: 'crown',
    perk: {
      label: 'The Old Blood',
      desc: 'Your capital yields +10% gold. Banner Knights cost 10% less.',
      fx: { capitalIncomePct: 10, unitDiscountId: 'knights', unitDiscountPct: 10 },
    },
    signature: {
      id: 'royalMuster', name: 'Royal Muster',
      desc: 'A full company of Banner Knights musters at your seat, at once and without cost.',
      flavor: 'The Old Blood calls; the old families still answer. Mostly out of habit, which is the strongest reason there is.',
      cooldown: 12, target: 'none', fxFamily: 'bless',
    },
    lines: {
      intro: 'Twice crowned, gentlemen. The third time I shall not even need to sit down.',
      taunt: 'You may keep your head, but the crown on it was always borrowed.',
      gracious: 'A king remembers his friends. Fortunately for you, I am twice a king.',
      defeat: 'Crowns are lent, never owned. See that you return mine polished.',
      victory: 'Thrice-crowned, then. History does love a round number.',
    },
  },
  {
    id: 'halvard',
    name: 'Ser Halvard Dane',
    epithet: 'the Oathwall',
    creed: 'flame',
    blurb: 'The last marshal of the old palace guard, who held the Cinder Gate for three days after the Sundering. He fights defensive wars by preference and finishes them by principle.',
    personality: { aggression: 0.3, greed: 0.2, mysticism: 0.25, loyalty: 0.95, pride: 0.6 },
    favoredTerrain: 'hills',
    color: '#5b6472', colorAlt: '#d8d2c2', pattern: 'stripes', sigil: 'gate',
    perk: {
      label: 'Stonefast',
      desc: 'Walls cost 30% less, and walled provinces pay +4 gold in gate tolls. Your troops fight +14% harder defending your own provinces.',
      fx: { wallDiscountPct: 30, defendOwnPct: 14, walledIncomeAdd: 4 },
    },
    signature: {
      id: 'standFast', name: 'Stand Fast',
      desc: 'Every province you rule defends +25% until your next season, and attacks you launch from your own ground strike +12% harder — a held gate opens both ways.',
      flavor: 'No speech. He walks the wall once, and the wall understands.',
      cooldown: 8, target: 'none', fxFamily: 'ward',
    },
    lines: {
      intro: 'I held one gate for three days. I have since acquired more gates.',
      taunt: 'Come, then. Bring ladders. Bring friends. Bring stretchers.',
      gracious: 'An oath kept is the only stone that never cracks.',
      defeat: 'The wall stood. The wall always stands. Men are the part that breaks.',
      victory: 'The gate is shut, the realm is safe, and I am going to sit down.',
    },
  },
  {
    id: 'lyra',
    name: 'Lyra Dawnmere',
    epithet: 'the Morninglark',
    creed: 'flame',
    blurb: 'A farrier’s daughter who claims the dawn itself knighted her, and has the battlefield record to make theologians nervous about dismissing it. Marches early, sings terribly, wins often.',
    personality: { aggression: 0.85, greed: 0.2, mysticism: 0.5, loyalty: 0.7, pride: 0.45 },
    favoredTerrain: 'hills',
    color: '#c26a1f', colorAlt: '#f2e2c0', pattern: 'waves', sigil: 'lark',
    perk: {
      label: 'Dawn Crusade',
      desc: 'Your troops fight +12% harder against Umbra lords.',
      fx: { atkVsCreed: 'umbra', atkVsCreedPct: 12 },
    },
    signature: {
      id: 'dawnOath', name: 'Dawn Oath',
      desc: 'Swear a crusade against one lord: your attacks on them strike +15% harder for 3 seasons.',
      flavor: 'She swears it at sunrise, loudly and off-key. By noon the whole realm knows whose walls are next.',
      cooldown: 12, target: 'rival', fxFamily: 'bless',
    },
    lines: {
      intro: 'Up with the sun, lords! The realm won’t save itself, and you certainly won’t.',
      taunt: 'I’ll be at your gates by morning. I keep farmer’s hours.',
      gracious: 'Ride with me once and you’ll never want another banner.',
      defeat: 'Even the lark falls. Sing the verse again tomorrow, someone.',
      victory: 'Told you. Dawn always comes. It just needed cavalry.',
    },
  },
  // ------------------------------------------------------------------ ASH
  {
    id: 'ulvra',
    name: 'Thane Ulvra Stonemantle',
    epithet: 'the Unmoved',
    creed: 'ash',
    blurb: 'Matriarch of the crag-holds, who watched the lowlands burn from her mountains and sent down blankets, not banners. She joins this war reluctantly and intends to end it economically.',
    personality: { aggression: 0.35, greed: 0.5, mysticism: 0.3, loyalty: 0.8, pride: 0.7 },
    favoredTerrain: 'mountain',
    color: '#1f3a52', colorAlt: '#c8ccd2', pattern: 'plain', sigil: 'mountain',
    perk: {
      label: 'Deep Holds',
      desc: 'Mountain provinces yield +4 gold. Cragguard may also be raised in hill provinces.',
      fx: { incomeTerrainId: 'mountain', incomeTerrainAdd: 4, cragguardInHills: true },
    },
    signature: {
      id: 'deepRoads', name: 'The Deep Roads',
      desc: 'This season your armies march one province further — the under-mountain ways open.',
      flavor: 'The mountain keeps roads it never mentions. Guests use them once, blindfolded, and arrive very surprised.',
      cooldown: 8, target: 'none', fxFamily: 'ward',
    },
    lines: {
      intro: 'The mountain did not want this war. The mountain will nonetheless win it.',
      taunt: 'Come up, if you like. The path is narrow and my patience is wide.',
      gracious: 'Stone keeps its bargains. See that you are stone.',
      defeat: 'The holds are deep. We have outlasted worse than you. We will outlast you too.',
      victory: 'Enough. The realm will rest now, and so, at last, will I.',
    },
  },
  {
    id: 'maera',
    name: 'Maera Fenwise',
    epithet: 'the Moorwitch',
    creed: 'ash',
    blurb: 'The moors have always had a witch; Maera is merely the first to inherit a war along with the title. She reads the realm’s health in bog-water and finds it feverish. Her prescription involves fewer lords.',
    personality: { aggression: 0.4, greed: 0.3, mysticism: 0.95, loyalty: 0.6, pride: 0.4 },
    favoredTerrain: 'moor',
    color: '#2a7f7f', colorAlt: '#e2ded0', pattern: 'dots', sigil: 'reed',
    perk: {
      label: 'Fen-Cunning',
      desc: 'Moor provinces yield +12 gold. Spells cost 25% less Emberlight. You begin knowing Scrying Smoke.',
      fx: { incomeTerrainId: 'moor', incomeTerrainAdd: 12, spellDiscountPct: 25, startingSpell: 'scryingSmoke' },
    },
    signature: {
      id: 'fenLights', name: 'Fen Lights',
      desc: 'Lights walk your borders for 2 seasons: every province you rule defends +15%, attacks you launch from lit ground strike +15% harder, and everything bordering your realm is revealed.',
      flavor: 'Follow the lights, the children are told. The lights lead soldiers somewhere else entirely.',
      cooldown: 8, target: 'none', fxFamily: 'scry',
    },
    lines: {
      intro: 'The bog told me how this ends. I’m only here to make sure it keeps its word.',
      taunt: 'The moor has eaten grander armies than yours. It isn’t picky, mind.',
      gracious: 'You’ve sense. Rare crop, that. I’ll help it grow.',
      defeat: 'Willows bend, dear. I’ll be back with the spring flood.',
      victory: 'There now. The fever breaks. Everyone drink something warm.',
    },
  },
  {
    id: 'cormac',
    name: 'Cormac Hollowoak',
    epithet: 'the Rootward',
    creed: 'ash',
    blurb: 'Warden of the deepwood shires, older than most treaties and fonder of trees than of the people who sign them. Slow to anger; geological, once angered.',
    personality: { aggression: 0.25, greed: 0.25, mysticism: 0.5, loyalty: 0.85, pride: 0.3 },
    favoredTerrain: 'forest',
    color: '#3e6b3a', colorAlt: '#e8dcb8', pattern: 'crosshatch', sigil: 'oak',
    perk: {
      label: 'Old Growth',
      desc: 'Forest provinces defend +15% harder. Greenwood Wardens cost 20% less.',
      fx: { defenseTerrainId: 'forest', defenseTerrainPct: 15, unitDiscountId: 'wardens', unitDiscountPct: 20 },
    },
    signature: {
      id: 'greenwoodAmbush', name: 'Greenwood Ambush',
      desc: 'This season your attacks strike +12% harder wherever the battle touches forest — theirs or yours.',
      flavor: 'The wood goes quiet a day before. Woodcutters know to take a holiday.',
      cooldown: 8, target: 'none', fxFamily: 'curse',
    },
    lines: {
      intro: 'I have buried three of these wars under leaf-mold. Shall we begin the fourth?',
      taunt: 'The wood is patient. I, regrettably for you, am the wood.',
      gracious: 'Plant a thing and keep it alive. Then we may talk of ruling.',
      defeat: 'Cut the tree; the roots remain. Mind where you build.',
      victory: 'Good. Now — everyone out of my forest.',
    },
  },
  {
    id: 'branwen',
    name: 'Branwen Greyshore',
    epithet: 'the Tide-Reckoner',
    creed: 'ash',
    blurb: 'Mistress of the salt-road guilds, who can price a war to the copper and has decided this one is, regrettably, a sound investment. Her fleets carry wool, grain, and consequences.',
    personality: { aggression: 0.45, greed: 0.85, mysticism: 0.2, loyalty: 0.55, pride: 0.5 },
    favoredTerrain: 'meadow',
    color: '#6d3b7e', colorAlt: '#d9c8e2', pattern: 'waves', sigil: 'sail',
    perk: {
      label: 'Salt Roads',
      desc: 'Harborworks yield +4 extra gold. Sailing between harbors does not end an army’s march.',
      fx: { harborIncomeAdd: 4, seaMoveFree: true },
    },
    signature: {
      id: 'embargo', name: 'The Embargo',
      desc: 'Close the salt roads against one rival: their provinces yield 20% less gold for 2 seasons.',
      flavor: 'No fleet, no fuss. One letter to the guilds, and a realm discovers what it imports.',
      cooldown: 10, target: 'rival', fxFamily: 'curse',
    },
    lines: {
      intro: 'I’ve run the numbers, lords. Most of you are liabilities.',
      taunt: 'I have insured your coastline. Against you, specifically.',
      gracious: 'A fair trade beats a won war. Cheaper funerals, better wine.',
      defeat: 'Noted in the ledger: one realm, written off. The tide will bring another.',
      victory: 'The books balance at last. The realm, gentlemen, is bought and paid for.',
    },
  },
  // ---------------------------------------------------------------- UMBRA
  {
    id: 'corvas',
    name: 'Duke Corvas Hollowmere',
    epithet: 'the Pale Bargain',
    creed: 'umbra',
    blurb: 'It is said the Duke has never broken a contract, and that this is entirely a matter of drafting. Owns four castles, several lords’ debts, and at least one of everyone’s secrets.',
    personality: { aggression: 0.5, greed: 0.95, mysticism: 0.35, loyalty: 0.15, pride: 0.6 },
    favoredTerrain: 'meadow',
    color: '#3a3a3a', colorAlt: '#cfc8b8', pattern: 'stripes', sigil: 'coin',
    perk: {
      label: 'Everything Has a Price',
      desc: 'Demands and tribute bring +25% more gold. Shadecloaks cost 20% less.',
      fx: { demandBonusPct: 25, unitDiscountId: 'shadecloaks', unitDiscountPct: 20 },
    },
    signature: {
      id: 'callTheDebts', name: 'Call in the Debts',
      desc: 'Every living rival immediately pays you a cut of their treasury — 6% against one rival, gentler per head as the table grows. None of them thanks you for it.',
      flavor: 'The appendix, gentlemen. Nobody reads the appendix. The appendix reads you.',
      cooldown: 10, target: 'none', fxFamily: 'curse',
    },
    lines: {
      intro: 'Peace, war — details of scheduling. Shall we discuss terms?',
      taunt: 'I already own the ground you’re standing on. Ask your treasurer.',
      gracious: 'A pleasure doing business. Do read the appendix.',
      defeat: 'Very well. Everything I own is hidden, and everything you found is cursed. Good day.',
      victory: 'The realm signs here, here, and — yes — in blood is traditional.',
    },
  },
  {
    id: 'nyssa',
    name: 'Lady Nyssa Vex',
    epithet: 'the Quiet Knife',
    creed: 'umbra',
    blurb: 'Nobody remembers inviting Lady Vex to court, and nobody has managed to make her leave. Wars, in her view, are decided in pantries, bedchambers, and margins — battles merely announce the result.',
    personality: { aggression: 0.4, greed: 0.5, mysticism: 0.6, loyalty: 0.3, pride: 0.55 },
    favoredTerrain: 'moor',
    color: '#b05c74', colorAlt: '#2e2230', pattern: 'dots', sigil: 'knife',
    perk: {
      label: 'The Long Ear',
      desc: 'Your heroes gain +2 guile on quests. Sow Discord costs half. You begin knowing it.',
      fx: { questGuileAdd: 2, discordDiscountPct: 50, startingSpell: 'sowDiscord' },
    },
    signature: {
      id: 'whisperCampaign', name: 'Whisper Campaign',
      desc: 'A rival province bordering your realm loses 15 order, at once.',
      flavor: 'Three dinners, one funeral, and a rumor with excellent posture.',
      cooldown: 6, target: 'enemyProvince', fxFamily: 'curse',
    },
    lines: {
      intro: 'Go on with your speeches. I’ve already read the drafts.',
      taunt: 'You talk of armies. I know what your cook knows.',
      gracious: 'Secrets kept are sweeter than gold. I keep both, at interest.',
      defeat: 'Kill the spider, keep the web. You’ll wish you’d burned it.',
      victory: 'Strange — no one saw me win. No one ever sees the important part.',
    },
  },
  {
    id: 'morrikan',
    name: 'Morrikan',
    epithet: 'the Thrice-Buried',
    creed: 'umbra',
    blurb: 'Buried by enemies three times, to widely acknowledged lack of effect. Morrikan speaks of the Sundering as a door left ajar, and of the dead as constituents. His rallies are quiet but extremely well attended.',
    personality: { aggression: 0.6, greed: 0.3, mysticism: 0.95, loyalty: 0.4, pride: 0.75 },
    favoredTerrain: 'moor',
    color: '#7a7a33', colorAlt: '#1e1e16', pattern: 'crosshatch', sigil: 'skullmoth',
    perk: {
      label: 'The Open Door',
      desc: 'You may raise Barrow Revenants in provinces with a barrow. Your armies are immune to terror.',
      fx: { revenantsAtBarrows: true, terrorImmune: true },
    },
    signature: {
      id: 'openTheDoors', name: 'Open the Doors',
      desc: 'The dead answer at every barrow you rule: a company of Barrow Revenants rises at each (−4 order there). Without a barrow, one still answers at your seat.',
      flavor: 'Constituents, he calls them. They vote in ranks.',
      cooldown: 12, target: 'none', fxFamily: 'summon',
    },
    lines: {
      intro: 'Three graves could not hold me. One throne should manage nicely.',
      taunt: 'I have more soldiers under your fields than you have upon them.',
      gracious: 'Loyalty outlasting death — that, I respect. Everything else is weather.',
      defeat: 'Bury me deep this time. I do so enjoy the walk back.',
      victory: 'The living and the dead agree at last: sit down, Morrikan. So I shall.',
    },
  },
  {
    id: 'vaelia',
    name: 'Vaelia Duskthorn',
    epithet: 'the Crowqueen',
    creed: 'umbra',
    blurb: 'Where armies march, crows follow; Vaelia simply reversed the arrangement. A warlord of the ruined east marches who found her calling the day the realm broke, and has been thriving on the pieces since.',
    personality: { aggression: 0.9, greed: 0.6, mysticism: 0.4, loyalty: 0.25, pride: 0.7 },
    favoredTerrain: 'hills',
    color: '#2e5090', colorAlt: '#0f1526', pattern: 'checks', sigil: 'crow',
    perk: {
      label: 'War Feeds Her',
      desc: 'Winning any battle plunders +15 extra gold. Wolfshead bands never raid your lands.',
      fx: { plunderWinGold: 15, wolfsheadSafe: true },
    },
    signature: {
      id: 'markForCrows', name: 'Marked for the Crows',
      desc: 'Mark one lord: for 3 seasons, every battle you win against them is plundered threefold.',
      flavor: 'The crows learn a new sigil. They are quick studies, and always hungry.',
      cooldown: 10, target: 'rival', fxFamily: 'curse',
    },
    lines: {
      intro: 'The realm broke itself, sweetlings. I’m only here for the marrow.',
      taunt: 'My crows grow fat on bolder lords than you. They’re not fussy, though.',
      gracious: 'You fight well. I’ll have you killed last, and fondly.',
      defeat: 'Ah well. The crows change banners faster than men do. Feed them for me.',
      victory: 'A realm of ashes and everything in it mine. Even the crows salute.',
    },
  },
];

export const LORD_BY_ID: Record<string, LordDef> = Object.fromEntries(LORDS.map((l) => [l.id, l]));
