/**
 * The Council Brief: the season at a glance, before you spend it.
 * Three registers, all read straight off the engine's own selectors:
 * what the next season will pay, what just happened around your banner,
 * and what stands open. Every line deep-links to the surface that acts
 * on it, no line claims to know the best move, and nothing here writes
 * state: the Brief is a reader, the war table is the pen.
 */
import { emberlightIncome, incomeReport } from '../../engine/economy';
import { armiesOf, getStance, heroesOf, provincesOf } from '../../engine/helpers';
import { chronicleScore, dominionShareAt } from '../../engine/victory';
import { LORD_BY_ID } from '../../engine/content/lords';
import type { ChronicleEntry } from '../../engine/types';
import { h, mount } from '../dom';
import { fmt, lordDisplay, signed } from '../format';
import { iconSvg } from '../icons';
import { openModal } from '../modal';
import { openCourtOverlay, openDiplomacyOverlay, openLedgerOverlay, openMagicOverlay } from './overlays';
import type { GameScreen } from '../screens/game';

const INTENTIONS = [
  'Hold what is mine',
  'Take new ground',
  'Fill the treasury',
  'Court the other lords',
  'Feed the saga',
] as const;

function intentionKey(screen: GameScreen): string {
  return `rie-intent-${screen.state.seed}`;
}

/** True omissions only: things the season would genuinely waste. */
export function seasonOmissions(screen: GameScreen): { text: string; go: () => void }[] {
  const state = screen.state;
  const pid = screen.viewerId();
  if (state.current !== pid || screen.current().kind !== 'human') return [];
  const out: { text: string; go: () => void }[] = [];
  const idle = armiesOf(state, pid).filter((a) => !a.moved && a.units.length > 0);
  if (idle.length > 0) {
    out.push({
      text: `${idle.length} ${idle.length === 1 ? 'banner awaits' : 'banners await'} marching orders`,
      go: () => screen.selectArmy(idle[0].id),
    });
  }
  const proposals = state.proposals.filter((p) => p.to === pid);
  if (proposals.length > 0) {
    out.push({
      text: `${proposals.length} ${proposals.length === 1 ? 'envoy waits' : 'envoys wait'} on your word`,
      go: () => openDiplomacyOverlay(screen, proposals[0].from),
    });
  }
  const player = state.players[pid];
  if (player.rite && player.emberlight > 0) {
    out.push({
      text: `The rite waits on Emberlight you hold (${player.rite.paid}/${player.rite.cost} pledged)`,
      go: () => openMagicOverlay(screen),
    });
  }
  if (player.signatureCooldownLeft === 0 && LORD_BY_ID[player.lordId]?.signature) {
    out.push({
      text: `${LORD_BY_ID[player.lordId].signature.name} stands ready`,
      go: () => screen.openSignatureModal(),
    });
  }
  const counsel = heroesOf(state, pid).filter((hh) => hh.levelChoices.length > 0);
  if (counsel.length > 0) {
    out.push({
      text: `${counsel[0].name} awaits your counsel`,
      go: () => openCourtOverlay(screen, counsel[0].id),
    });
  }
  return out;
}

export function openBriefOverlay(screen: GameScreen): void {
  const state = screen.state;
  const pid = screen.viewerId();
  const player = state.players[pid];
  const body = h('div', { class: 'overlay-body brief-body' });
  const modal = openModal('The Council Brief', body, { wide: true });

  // ---------------------------------------------------------- the coin
  const income = incomeReport(state, pid);
  const ember = emberlightIncome(state, pid);
  const forecast = h('div', { class: 'panel brief-card' },
    h('h3', { class: 'settings-head' }, 'The season ahead'),
    h('p', { class: 'small' },
      `The treasury holds ${fmt(player.gold)} gold. Next season brings ${signed(income.net)} ` +
      `(income ${fmt(income.gold)}, upkeep −${fmt(income.upkeep)}, wages −${fmt(income.wages)}) ` +
      `and ${signed(ember.total)} Emberlight.`),
    income.net < 0
      ? h('p', { class: 'small neg' }, 'The realm spends more than it raises. The ledger names every cause.')
      : null,
  );

  // -------------------------------------------------- what just happened
  const mine = (e: ChronicleEntry): boolean =>
    (e.privateTo === undefined || e.privateTo === pid) && (e.about === pid || e.kind === 'war' || e.kind === 'diplomacy');
  const recent = state.chronicle
    .filter((e) => e.turn >= state.turn - 1 && !e.digest && mine(e))
    .slice(-3)
    .reverse();
  const developments = h('div', { class: 'panel brief-card' },
    h('h3', { class: 'settings-head' }, 'Developments'),
    ...(recent.length > 0
      ? recent.map((e) => h('p', { class: 'small' }, e.text))
      : [h('p', { class: 'small muted italic' }, 'A quiet stretch: the kind historians skip and rulers treasure.')]),
  );

  // ------------------------------------------------------- what's open
  const omissions = seasonOmissions(screen);
  const open = h('div', { class: 'panel brief-card' },
    h('h3', { class: 'settings-head' }, 'Standing open'),
    ...(omissions.length > 0
      ? omissions.slice(0, 4).map((o) =>
          h('button', { class: 'brief-link', onclick: () => { modal.close(); o.go(); } },
            h('span', { html: iconSvg('arrowRight', 12) }), ' ', o.text))
      : [h('p', { class: 'small muted italic' }, 'Nothing waits on you. End the Season with a clear desk.')]),
  );

  // ----------------------------------------------------------- the race
  const total = state.provinces.length;
  const alive = state.players.filter((p) => p.alive);
  const byShare = [...alive].sort((a, b) => provincesOf(state, b.id).length - provincesOf(state, a.id).length);
  const leader = byShare[0];
  const leaderShare = provincesOf(state, leader.id).length / total;
  const byScore = [...alive].sort((a, b) => chronicleScore(state, b.id).total - chronicleScore(state, a.id).total);
  const myScoreRank = byScore.findIndex((p) => p.id === pid) + 1;
  const race = h('div', { class: 'panel brief-card' },
    h('h3', { class: 'settings-head' }, 'The race'),
    h('p', { class: 'small' },
      `${lordDisplay(state, leader.id).name} holds ${Math.round(leaderShare * 100)}% of the realm ` +
      `(dominion asks ${Math.round(dominionShareAt(state) * 100)}%). ` +
      `By the chronicle's count you stand ${myScoreRank === 1 ? 'first' : myScoreRank === 2 ? 'second' : myScoreRank === 3 ? 'third' : `${myScoreRank}th`} of ${alive.length}.`),
    h('button', { class: 'brief-link', onclick: () => { modal.close(); openLedgerOverlay(screen); } },
      h('span', { html: iconSvg('arrowRight', 12) }), ' The full Ledger holds every race'),
  );

  // ------------------------------------------------------ the intention
  // An intention is a promise the Brief keeps score on: setting one
  // snapshots the realm, and once the season has turned, the next Brief
  // opens with the verdict. Read-only against engine selectors, stored on
  // this device only.
  const held = loadIntention(screen);
  const verdict = held && state.turn > held.turn ? intentionVerdict(screen, held) : null;
  const intention = h('div', { class: 'panel brief-card' },
    h('h3', { class: 'settings-head' }, 'The intention'),
    verdict
      ? h('p', { class: 'small' },
          `You set out to ${INTENTIONS[held!.idx].toLowerCase()}: `,
          h('span', { class: verdict.kept ? 'pos' : 'neg' }, verdict.text))
      : held
        ? h('p', { class: 'small muted' }, `This season's aim: ${INTENTIONS[held.idx].toLowerCase()}. The next Brief says how it went.`)
        : h('p', { class: 'small muted' }, 'Name the season\'s aim. The next Brief says how it went.'),
    h('div', { class: 'brief-intents' },
      ...INTENTIONS.map((label, i) =>
        h('button', {
          class: `btn btn-quiet compact${held?.idx === i ? ' theater-speed-on' : ''}`,
          onclick: (e: Event) => {
            saveIntention(screen, i);
            const row = (e.currentTarget as HTMLElement).parentElement!;
            for (const b of row.children) b.classList.remove('theater-speed-on');
            (e.currentTarget as HTMLElement).classList.add('theater-speed-on');
          },
        }, label)),
    ),
  );
  // a verdict delivered is a page turned: re-arm the snapshot at this season
  if (verdict && held) saveIntention(screen, held.idx);

  mount(body, forecast, developments, open, race, intention);
}

interface IntentionSnapshot {
  idx: number;
  turn: number;
  provinces: number;
  gold: number;
  bonds: number;
  saga: number;
}

function bondsOf(screen: GameScreen): number {
  const state = screen.state;
  const pid = screen.viewerId();
  return state.players.filter((o) => {
    if (!o.alive || o.id === pid) return false;
    const s = getStance(state, pid, o.id);
    return s === 'pact' || s === 'alliance';
  }).length;
}

function loadIntention(screen: GameScreen): IntentionSnapshot | null {
  try {
    const raw = localStorage.getItem(intentionKey(screen));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntentionSnapshot;
    if (typeof parsed.idx !== 'number' || !INTENTIONS[parsed.idx]) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveIntention(screen: GameScreen, idx: number): void {
  const state = screen.state;
  const pid = screen.viewerId();
  const snapshot: IntentionSnapshot = {
    idx,
    turn: state.turn,
    provinces: provincesOf(state, pid).length,
    gold: state.players[pid].gold,
    bonds: bondsOf(screen),
    saga: state.players[pid].sagaChapter,
  };
  try { localStorage.setItem(intentionKey(screen), JSON.stringify(snapshot)); } catch { /* full storage loses a note, never a game */ }
}

/** The verdict, one plain line, from the same selectors the Ledger reads. */
function intentionVerdict(screen: GameScreen, then: IntentionSnapshot): { kept: boolean; text: string } {
  const state = screen.state;
  const pid = screen.viewerId();
  const provinces = provincesOf(state, pid).length;
  const gained = provinces - then.provinces;
  switch (then.idx) {
    case 0: // hold what is mine
      return gained >= 0
        ? { kept: true, text: 'not one province slipped from the banner.' }
        : { kept: false, text: `${-gained} ${gained === -1 ? 'province' : 'provinces'} slipped from the banner.` };
    case 1: { // take new ground
      return gained > 0
        ? { kept: true, text: `${gained} ${gained === 1 ? 'province' : 'provinces'} joined your banner.` }
        : { kept: false, text: 'no new ground was taken.' };
    }
    case 2: { // fill the treasury
      const delta = state.players[pid].gold - then.gold;
      return delta > 0
        ? { kept: true, text: `the treasury grew by ${fmt(delta)} gold.` }
        : { kept: false, text: delta === 0 ? 'the treasury stands where it stood.' : `the realm ended ${fmt(-delta)} gold poorer.` };
    }
    case 3: { // court the other lords
      const bonds = bondsOf(screen);
      return bonds > then.bonds
        ? { kept: true, text: 'new oaths were sworn.' }
        : { kept: false, text: 'no new oaths yet. The envoys keep trying.' };
    }
    default: { // feed the saga
      const saga = state.players[pid].sagaChapter;
      return saga > then.saga
        ? { kept: true, text: `the saga turned a chapter (${saga} of 5).` }
        : { kept: false, text: 'the saga waits on its next page.' };
    }
  }
}
