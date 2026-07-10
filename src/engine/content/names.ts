/**
 * Naming: provinces, people, epithets, and province flavor lines.
 * The generator composes from curated parts so every map reads authored,
 * and a uniqueness pass guarantees no repeats within a game.
 */
import type { Rng } from '../rng';
import type { HeroClass, SiteType, Terrain } from '../types';

// -------------------------------------------------------------- provinces

const PREFIX: Record<Terrain, string[]> = {
  meadow: ['Wheat', 'Gold', 'Harrow', 'Sun', 'Mead', 'Clover', 'Lark', 'Hay', 'Amber', 'Bell', 'Fallow', 'Orchard'],
  forest: ['Elder', 'Green', 'Thorn', 'Oaken', 'Deep', 'Bram', 'Rowan', 'Shade', 'Wolfen', 'Yew', 'Tangle', 'Hollow'],
  hills: ['Stone', 'Sheep', 'Wind', 'High', 'Bracken', 'Grey', 'Tor', 'Heather', 'Ram', 'Chalk', 'Beacon', 'Cairn'],
  mountain: ['Crag', 'Iron', 'Frost', 'Storm', 'Ember', 'Anvil', 'Raven', 'Karst', 'Grim', 'Slate', 'Thunder', 'Adder'],
  moor: ['Fen', 'Mist', 'Bog', 'Sedge', 'Ashen', 'Weep', 'Marrow', 'Dim', 'Reed', 'Sallow', 'Murk', 'Heron'],
};

const SUFFIX: Record<Terrain, string[]> = {
  meadow: ['field', 'dene', 'holm', 'stead', 'acre', 'ford', 'don', 'leigh', 'garth', 'combe'],
  forest: ['holt', 'wood', 'weald', 'thicket', 'hollow', 'glen', 'shaw', 'brake', 'root', 'grove'],
  hills: ['down', 'fell', 'ridge', 'tor', 'barrow', 'crest', 'heath', 'edge', 'knap', 'rise'],
  mountain: ['spire', 'reach', 'gate', 'horn', 'cleft', 'watch', 'deep', 'fast', 'scarp', 'pass'],
  moor: ['mere', 'moor', 'mire', 'marsh', 'wash', 'slough', 'hag', 'water', 'sink', 'vigil'],
};

/** Names too good to leave to chance — sprinkled in before generation. */
const CURATED: Record<Terrain, string[]> = {
  meadow: ['The Braided Vale', 'Kingsbarley', 'Widow’s Acre', 'The Long Larder'],
  forest: ['The Unswept Wood', 'Vesper Weald', 'The Quiet Fathoms', 'Owlmark'],
  hills: ['The Shepherd’s Spine', 'Old Scold’s Down', 'The Seven Sisters', 'Gallows Heath'],
  mountain: ['The Broken Crown', 'Cindermaw', 'The Weeping Stair', 'Foundry Gate'],
  moor: ['The Drowned March', 'Candlefen', 'The Whispering Flats', 'Grief’s Hollow'],
};

export function makeProvinceNamer(rng: Rng): (terrain: Terrain) => string {
  const used = new Set<string>();
  const curatedLeft: Record<Terrain, string[]> = {
    meadow: rng.shuffle(CURATED.meadow),
    forest: rng.shuffle(CURATED.forest),
    hills: rng.shuffle(CURATED.hills),
    mountain: rng.shuffle(CURATED.mountain),
    moor: rng.shuffle(CURATED.moor),
  };
  return (terrain: Terrain) => {
    // roughly one curated name per three provinces of a terrain
    if (curatedLeft[terrain].length > 0 && rng.chance(0.34)) {
      const name = curatedLeft[terrain].pop()!;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    for (let tries = 0; tries < 40; tries++) {
      const name = rng.pick(PREFIX[terrain]) + rng.pick(SUFFIX[terrain]);
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    // pathological fallback: qualify with a cardinal
    const base = rng.pick(PREFIX[terrain]) + rng.pick(SUFFIX[terrain]);
    const name = `${rng.pick(['Nether', 'Upper', 'Far', 'Old'])} ${base}`;
    used.add(name);
    return name;
  };
}

// ------------------------------------------------------- province flavor

const FLAVOR: Record<Terrain, string[]> = {
  meadow: [
    'Feeds three provinces and complains for six.',
    'The barley here grows tall enough to hide a modest cavalry ambush. It has.',
    'Its markets sell everything, including, twice now, the deed to itself.',
    'Peaceful, prosperous, and utterly indefensible — the tax collector’s favorite words.',
    'The bell in the granary tower rings for weddings, harvests, and approaching armies, in the same cheerful tone.',
    'Local proverb: a full barn has many heirs.',
  ],
  forest: [
    'The charcoal burners speak of lights between the trees, and price their charcoal accordingly.',
    'Older than the realm, and inclined to mention it.',
    'The king’s surveyors marked its heart on three maps. All three maps disagree.',
    'Timber from here built half the fleet and, allegedly, walks home at night.',
    'The foresters pay their tithe in arrows: point-first is considered a political statement.',
    'What the wood takes, the wood keeps. Ask after the toll bridge of 402.',
  ],
  hills: [
    'Wool, stone, and stubbornness — the three exports, in rising order of supply.',
    'Every hilltop has a cairn; every cairn has an opinion.',
    'The shepherds here can tell a storm two days out and a war three.',
    'Its drystone walls have outlasted four dynasties without mortar or enthusiasm.',
    'The wind arrives in autumn and leaves, reluctantly, in spring.',
    'A land of long views and short conversations.',
  ],
  mountain: [
    'The passes are shut four months a year, which the locals count as a civic amenity.',
    'Ore veins here still glow faintly. Miners call it throne-light and charge double.',
    'The eagles nest lower than the hermits do.',
    'The Sundering cracked these peaks; on cold nights the cracks sing.',
    'Its one road was built by a conqueror who died maintaining it.',
    'Stone is honest work: it either holds or it doesn’t, and it mostly holds.',
  ],
  moor: [
    'The fen keeps what it is given and gives back what it pleases, usually boots.',
    'Will-o’-wisps here are said to be old tax ledgers, still burning.',
    'The causeway is the only law, and it floods.',
    'Herons stand in the shallows like unpaid sentries.',
    'They cut peat with the respect of men opening someone else’s letters.',
    'The mist comes in at dusk and reads over your shoulder.',
  ],
};

const SITE_FLAVOR: Record<SiteType, string[]> = {
  embersite: [
    'A shard of the sundered throne smolders here; the night never gets fully dark.',
    'The ground here holds warmth like a grudge. Farmers plant early and pray late.',
    'Ember-light stands off the rocks at dusk. The adepts call it holy. The shepherds call it a nuisance with opinions.',
  ],
  ruin: [
    'A ruin of the old realm stands here, roofless, patient, and reputedly not empty.',
    'The old walls here have outlived their builders, their conquerors, and every plan for their removal.',
    'Locals quarry the ruin for stone but only by daylight, and never the lintels.',
  ],
  shrine: [
    'Pilgrims still climb to the shrine here, leaving candles and taking rumors.',
    'The wayshrine here answers no prayers, which the devout consider a kind of honesty.',
    'Offerings at the shrine double in wartime. Faith follows fear the way gulls follow plows.',
  ],
  barrow: [
    'The barrow-mounds here predate the realm. The locals nod to them, just in case.',
    'Nothing grazes on the barrows, by unspoken agreement between the sheep and whatever is under them.',
    'The mounds keep their dead well. Grave-goods surface after hard rains, and are politely reburied.',
  ],
  forge: [
    'An ancient forge sleeps here; its anvil is warm to the touch on midwinter nights.',
    'Smiths make pilgrimage to the old forge to touch hammers to its anvil. The hammers, they insist, ring truer after.',
    'The forge here predates the throne it armed. It is patient. Forges are always waiting for the next war.',
  ],
  circle: [
    'A ring of standing stones crowns this land. Compasses sulk inside it.',
    'The standing stones cast their shadows a heartbeat late. Surveyors refuse the commission.',
    'Sheep will not cross the stone ring, which the shepherds call wisdom and the adepts call a waste of good grazing.',
  ],
};

export function provinceFlavor(rng: Rng, terrain: Terrain, site: SiteType | null): string {
  if (site) return rng.pick(SITE_FLAVOR[site]);
  return rng.pick(FLAVOR[terrain]);
}

export const SITE_NAMES: Record<SiteType, string> = {
  embersite: 'Ember-site',
  ruin: 'Old Ruin',
  shrine: 'Wayshrine',
  barrow: 'Barrowfield',
  forge: 'Ancient Forge',
  circle: 'Standing Stones',
};

// ----------------------------------------------------------------- people

const FIRST_NAMES = [
  'Aldous', 'Berrin', 'Cass', 'Darrow', 'Edwyn', 'Ffion', 'Garrick', 'Hale', 'Isolde', 'Jorah',
  'Kestrel', 'Lowri', 'Maddoc', 'Nerys', 'Osric', 'Petra', 'Quill', 'Rhoswen', 'Sabel', 'Tamsin',
  'Ulric', 'Vanna', 'Wystan', 'Yorath', 'Zephrine', 'Brannoc', 'Ceridwen', 'Dunstan', 'Elowen', 'Fenn',
  'Gwendolyn', 'Hadrick', 'Ianthe', 'Kelda', 'Leofric', 'Morwenna', 'Nolan', 'Oriane', 'Pellam', 'Rowena',
];

const SURNAMES = [
  'of the Ford', 'Thatchbane', 'Greyhand', 'of Nine Fields', 'Underhill', 'Saltmarsh', 'Pyke',
  'of the Old Road', 'Cindermane', 'Ashworth', 'Brackenbury', 'of the Low Gate', 'Harrower',
  'Quickstep', 'of the Last Bridge', 'Duskwater', 'Emberlane', 'Longstride', 'of the Shorn Hill', 'Vane',
];

const EPITHETS: Record<HeroClass, string[]> = {
  champion: ['the Unbowed', 'Oakbreaker', 'the Red Gale', 'Shieldless', 'the Lion of the Ford', 'Twice-Scarred', 'the Anvil', 'Bannerbright'],
  magus: ['the Kindled', 'Ashreader', 'the Patient Flame', 'Sparrow-Wise', 'the Half-Lit', 'Cinderquick', 'the Unburnt', 'Lanternbearer'],
  warden: ['the Far-Eyed', 'Thornwalker', 'the Grey Arrow', 'Wolf-Friend', 'the Quiet Bow', 'Mistwader', 'the Pathless', 'Owlkeeper'],
  shade: ['the Unseen', 'Softstep', 'the Smiling Debt', 'Knifewhisper', 'the Second Shadow', 'Lockless', 'the Kind Poison', 'Half-Rumor'],
};

export function makePersonName(rng: Rng, cls: HeroClass): { name: string; epithet: string } {
  const name = rng.chance(0.55)
    ? `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`
    : rng.pick(FIRST_NAMES);
  return { name, epithet: rng.pick(EPITHETS[cls]) };
}

/** Rebellion leaders, wolfshead captains — one-line notorieties. */
export function makeTroubleName(rng: Rng): string {
  const who = rng.pick(FIRST_NAMES);
  const what = rng.pick([
    'the Twice-Hanged', 'Corncrake', 'the Mad Reeve', 'Tithebane', 'the Barefoot',
    'Kettleblack', 'the Unpaid', 'Straw-Crown', 'the Howler', 'Grindstone',
  ]);
  return `${who} ${what}`;
}
