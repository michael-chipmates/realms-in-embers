/**
 * Osperan the Unresting — last chronicler of the Ember Throne, dead these
 * forty years and still on deadline. He writes the war as history while it
 * happens: past tense, dry, and more attached to these fools than he admits.
 *
 * Line engine: each bank holds variants; selection avoids recently-used lines
 * (state.narratorUsed) so he rarely repeats himself. All randomness comes
 * from the game Rng — the chronicle is part of the deterministic record.
 */
import type { Rng } from './rng';
import type { ChronicleEntry, ChronicleKind, GameState, PlayerId } from './types';

type Variant<C> = (c: C) => string;

interface Bank<C> {
  kind: ChronicleKind;
  ceremony?: boolean;
  variants: Variant<C>[];
}

function defineBank<C>(kind: ChronicleKind, variants: Variant<C>[], ceremony = false): Bank<C> {
  return { kind, ceremony, variants };
}

// ------------------------------------------------------------ starter banks

const BANKS = {
  opening: defineBank<{ realmAge: number; lords: string; count: number }>(
    'ceremony',
    [
      (c) => `Forty years since the Sundering, and the realm still glows where it broke. This season, ${c.count} banners rose to claim the ashes: ${c.lords}. I took up my pen again. Somebody has to bury them properly.`,
      (c) => `The Ember Throne has been cold for a generation, which is apparently long enough for everyone to forget how it got that way. ${c.count} claimants now: ${c.lords}. I began a fresh page and, out of old habit, ruled a margin for the dead.`,
      (c) => `They say a chronicle should open with the weather. Very well: ash on the wind, frost on the passes, and ${c.count} lords — ${c.lords} — each quite certain the realm is theirs. The weather, in short, was war.`,
    ],
    true,
  ),
  captureNeutral: defineBank<{ lord: string; province: string }>(
    'war',
    [
      (c) => `${c.lord} marched into ${c.province}, whose people had governed themselves passably for forty years and were not consulted on the change.`,
      (c) => `${c.province} fell to ${c.lord} with little ceremony. The locals took down one banner, hung another, and hid the good silver as their grandparents taught them.`,
      (c) => `${c.lord} added ${c.province} to the realm-in-progress. The province's records list the year's chief exports as wool, barley, and independence.`,
      (c) => `The free province of ${c.province} was liberated by ${c.lord} — from its freedom, chiefly.`,
    ],
  ),
  captureEnemy: defineBank<{ lord: string; loser: string; province: string }>(
    'war',
    [
      (c) => `${c.lord} tore ${c.province} from ${c.loser}. The maps in both war-tents were redrawn; the graves needed no revision.`,
      (c) => `${c.province} changed hands, ${c.loser}'s banner coming down and ${c.lord}'s going up. The flagpole, at least, is having a busy war.`,
      (c) => `${c.lord} took ${c.province} at sword's point. ${c.loser} called it treachery; the garrison called it Tuesday, briefly, and then called it nothing at all.`,
      (c) => `By evening ${c.province} belonged to ${c.lord}. History will note the strategy; the province will remember the boots.`,
    ],
  ),
  captureSeat: defineBank<{ lord: string; loser: string; province: string }>(
    'ceremony',
    [
      (c) => `The seat of ${c.loser} fell. ${c.lord} walked the halls of ${c.province} as its master, and the servants — who have survived three dynasties by counting spoons and saying nothing — began counting spoons.`,
      (c) => `${c.province}, high seat of ${c.loser}, opened its gates to ${c.lord}. A realm can lose a thousand fields and shrug; it loses a throne-hall and something in it breaks aloud.`,
      (c) => `${c.lord} took ${c.loser}'s own seat of ${c.province}. In the great hall the old fire was relit by the victors, who did not know it had been kept banked, faithfully, all these years.`,
    ],
    true,
  ),
  fieldBattle: defineBank<{ winner: string; loser: string; province: string; scale: string }>(
    'war',
    [
      (c) => `${c.winner} met ${c.loser} in ${c.province} and held the field — ${c.scale}. The crows, as ever, declared for the winner.`,
      (c) => `Battle in ${c.province}: ${c.winner} over ${c.loser}, ${c.scale}. Both sides prayed beforehand. The gods, spread thin these days, attended neither.`,
      (c) => `${c.loser} gave battle to ${c.winner} in ${c.province} and wished, presently, that they hadn't. ${c.scale}.`,
      (c) => `The matter of ${c.province} was argued by some thousands of armed scholars. ${c.winner} carried the debate; ${c.scale}.`,
    ],
  ),
  rebellion: defineBank<{ lord: string; province: string; leader: string }>(
    'realm',
    [
      (c) => `${c.province} rose against ${c.lord} behind one ${c.leader}. Rebellions are itemized grievances with pitchforks attached, and this one's list was long and, frankly, well-drafted.`,
      (c) => `Word reached ${c.lord} that ${c.province} had stopped paying taxes and started sharpening them. The rising follows ${c.leader}, who promises much, which is traditional.`,
      (c) => `${c.province} declared itself done with ${c.lord}. The rebel ${c.leader} flies a straw crown for a banner — mockery now, ambition by autumn, if unattended.`,
    ],
  ),
  heroDied: defineBank<{ hero: string; epithet: string; cause: string; lord: string }>(
    'ceremony',
    [
      (c) => `Here the chronicle slows, as it must. ${c.hero}, called ${c.epithet}, died ${c.cause}. I have written ten thousand names in this book. Some of them insist on mattering.`,
      (c) => `${c.hero} ${c.epithet} is dead — ${c.cause}. ${c.lord} has lost a sword, a counselor, and the particular silence that follows a name no one is ready to say in the past tense. I say it for them. That is my office.`,
      (c) => `Let the record state plainly: ${c.hero}, ${c.epithet}, fell ${c.cause}. The margin of this page is wide. I rule them wide on purpose, for names like this one.`,
    ],
    true,
  ),
  heroHired: defineBank<{ hero: string; epithet: string; lord: string; cls: string }>(
    'hero',
    [
      (c) => `A ${c.cls} calling themselves ${c.hero} — ${c.epithet}, no less — took ${c.lord}'s coin. Epithets are free; we shall see about the rest.`,
      (c) => `${c.lord} welcomed ${c.hero} to court. The epithet "${c.epithet}" came with the luggage. Most do.`,
      (c) => `${c.hero} entered ${c.lord}'s service. I have opened a fresh line in the margin; heroes either fill a page or a grave, and usually both.`,
    ],
  ),
  eliminated: defineBank<{ lord: string; conqueror: string }>(
    'ceremony',
    [
      (c) => `And so ${c.lord} passes out of the war and into my footnotes, the last banner struck by ${c.conqueror}. Realms end loudly; lords end in inventory.`,
      (c) => `${c.lord} is finished — unseated, unhoused, unfollowed, undone by ${c.conqueror}. The chronicle keeps a page for every claimant. This one I now sand, blot, and close.`,
      (c) => `Strike the tents, fold the banner: ${c.lord} holds nothing now but a place in this book, courtesy of ${c.conqueror}. It is more than most get.`,
    ],
    true,
  ),
  victory: defineBank<{ lord: string; how: string }>(
    'ceremony',
    [
      (c) => `It is done. ${c.lord} has won the realm — ${c.how}. The Chronicle of the Sundered Age ends here, and I... I find my pen is out of ink, and my debt out of years. Whoever reads this: the fire is yours. Mind it.`,
      (c) => `${c.lord} stands where the Ember Throne stood, victorious — ${c.how}. Forty years I have waited to write a final sentence. Here it is. It was worth the wait, and the war, I leave to your judgment.`,
    ],
    true,
  ),
  chronicleClose: defineBank<{ lord: string; turns: number }>(
    'ceremony',
    [
      (c) => `${c.turns} seasons of war, and no throne relit — so the Chronicle itself must judge. By every measure that survives an age — lands held, hearths warm, oaths kept — the greatest claim belongs to ${c.lord}. Let the realm rest there. Even wars have bedtimes.`,
      (c) => `The page ran out before the war did, as I always feared it might. Weighing all — provinces, prosperity, the quiet of kept order — the Chronicle names ${c.lord} first among the claimants, and closes.`,
    ],
    true,
  ),
  warDeclared: defineBank<{ aggressor: string; target: string; oathbroken: boolean }>(
    'diplomacy',
    [
      (c) => c.oathbroken
        ? `${c.aggressor} tore up the pact with ${c.target} and marched. Parchment burns easily; the smell of it lingers on a name for years.`
        : `${c.aggressor} declared war upon ${c.target}. The heralds were paid double, as is customary for bad news delivered loudly.`,
      (c) => c.oathbroken
        ? `Let it be recorded plainly: ${c.aggressor} swore peace to ${c.target}, and lied. I keep a separate page for oathbreakers. It is among my fullest.`
        : `War, then, between ${c.aggressor} and ${c.target}. Neither asked my opinion. Chroniclers are only consulted afterwards, like gravediggers.`,
      (c) => c.oathbroken
        ? `${c.aggressor} broke faith with ${c.target} — the seal snapped, the banners moved. Every lord in the realm quietly re-read their own treaties.`
        : `${c.aggressor} sent ${c.target} a declaration written in the high style. Beneath the flourishes it said: what is yours will do nicely.`,
    ],
  ),
  peaceMade: defineBank<{ a: string; b: string }>(
    'diplomacy',
    [
      (c) => `${c.a} and ${c.b} made peace. The scribes wrote it fair, the lords sealed it warm, and everyone kept their boots by the door.`,
      (c) => `Peace between ${c.a} and ${c.b} — signed, sanded, witnessed. Wars end the way fevers do: not cured, just tired.`,
      (c) => `${c.a} and ${c.b} laid down the war. The border villages celebrated with the special joy of people who expect to do this again.`,
    ],
  ),
  goldenWarning: defineBank<{ lord: string; rounds: number }>(
    'realm',
    [
      (c) => `Mark this: ${c.lord}'s treasury groans and the realm under them hums with order. ${c.rounds} more such ${c.rounds === 1 ? 'season' : 'seasons'} and the war ends not with a sword but with a signature.`,
      (c) => `${c.lord} governs like a merchant prince — coffers full, hearths quiet. Give them ${c.rounds} more ${c.rounds === 1 ? 'season' : 'seasons'} of it and the crown is bought, not won.`,
    ],
  ),
  dominionWarning: defineBank<{ lord: string; rounds: number }>(
    'realm',
    [
      (c) => `${c.lord} now holds the greater part of the realm. ${c.rounds} more ${c.rounds === 1 ? 'season' : 'seasons'} unbroken and the matter is settled — the rest of you may wish to discuss that. Urgently. Together.`,
      (c) => `The map is turning one colour, and it is ${c.lord}'s. ${c.rounds} ${c.rounds === 1 ? 'season' : 'seasons'} remain before the realm simply... belongs to them.`,
    ],
  ),
  roundOmen: defineBank<{ turn: number }>(
    'turn',
    [
      () => `Rain on the passes this season. Armies hate rain; chroniclers love it — it keeps the casualty lists short and the ink long.`,
      () => `A comet stood over the realm for three nights. Half the wise called it an omen of ruin, half of triumph. Comets, in my experience, portend chiefly comets.`,
      () => `The granary mice are fat this year. Old campaigners will tell you what that means; they will be wrong, but affectingly certain.`,
      () => `Peddlers now sell 'shards of the Ember Throne' at every crossroads fair. By my arithmetic the throne has been sold eleven times over. Business is grief with a stall.`,
      () => `An abbot wrote asking whether the war would end by harvest. I replied that wars end at one of two harvests, and he should hope for the wheat.`,
    ],
  ),
};

export type BankKey = keyof typeof BANKS;

/** Append a chronicle entry from a bank, avoiding recent repeats. */
export function say<K extends BankKey>(
  state: GameState,
  rng: Rng,
  bank: K,
  ctx: Parameters<(typeof BANKS)[K]['variants'][number]>[0],
  opts: { about?: PlayerId | null; privateTo?: PlayerId } = {},
): ChronicleEntry {
  const b = BANKS[bank] as Bank<unknown>;
  const idx = pickVariant(state, rng, bank, b.variants.length);
  state.narratorUsed[`${bank}:${idx}`] = state.turn;
  const entry: ChronicleEntry = {
    turn: state.turn,
    kind: b.kind,
    text: b.variants[idx](ctx as never),
    about: opts.about ?? null,
    ...(opts.privateTo !== undefined ? { privateTo: opts.privateTo } : {}),
    ...(b.ceremony ? { ceremony: true } : {}),
  };
  state.chronicle.push(entry);
  return entry;
}

function pickVariant(state: GameState, rng: Rng, bank: string, count: number): number {
  const fresh: number[] = [];
  const stale: number[] = [];
  for (let i = 0; i < count; i++) {
    const last = state.narratorUsed[`${bank}:${i}`];
    if (last === undefined || state.turn - last > 6) fresh.push(i);
    else stale.push(i);
  }
  const pool = fresh.length > 0 ? fresh : stale;
  return pool[rng.int(pool.length)];
}

/** Direct authored entry (events, teachings) — still deduped by caller. */
export function scribe(
  state: GameState,
  entry: Omit<ChronicleEntry, 'turn'>,
): ChronicleEntry {
  const full: ChronicleEntry = { turn: state.turn, ...entry };
  state.chronicle.push(full);
  return full;
}
