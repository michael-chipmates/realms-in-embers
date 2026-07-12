/**
 * The battle theater: the same resolved battle the report shows, staged as
 * a scene: ranks of companies, a balance that tips clash by clash, the
 * field's own words between rounds, and an aftermath that answers "what
 * changed, and why did it differ from the augurs?"
 *
 * A pure BattleReport consumer. The engine decided everything long before
 * this file runs; every number here is quoted, never derived: per-round
 * numbers are hits struck (BattleRound), end-of-battle numbers are
 * companies lost (BattleSideSummary), and the two are never conflated.
 * Reduced motion never lands here: battleReport.ts keeps the still page.
 */
import { PREVIEW_RUNS } from '../../engine/combat';
import { UNITS } from '../../engine/content/units';
import type { BattleEventNote, BattleReport, BattleRound } from '../../engine/types';
import { h } from '../dom';
import { lordDisplay } from '../format';
import { sigilShield } from '../heraldry';
import { iconSvg } from '../icons';
import { openModal } from '../modal';
import { audio } from '../audio';
import type { GameScreen } from './game';

/** What the odds modal promised, carried across the dispatch so the
 * aftermath can be honest about it. */
export interface StakesPreview {
  winChance: number;
  aExpectedLoss: number;
  dExpectedLoss: number;
}

const SPEEDS = [
  { id: 'slow', label: 'Slow', ms: 950 },
  { id: 'standard', label: 'Standard', ms: 520 },
  { id: 'swift', label: 'Swift', ms: 240 },
] as const;
type SpeedId = (typeof SPEEDS)[number]['id'];
const SPEED_KEY = 'rie-battle-speed';

function savedSpeed(): SpeedId {
  const raw = localStorage.getItem(SPEED_KEY);
  return SPEEDS.some((s) => s.id === raw) ? (raw as SpeedId) : 'standard';
}

/** Round labels, shared with the decisive-moment lines so they can never
 * name a clash the playback numbered differently. */
function roundLabels(rounds: BattleRound[]): string[] {
  const volleysFirst = rounds[0]?.notes.some((n) => n.includes('Arrow')) ?? false;
  return rounds.map((_, i) =>
    (i === 0 && volleysFirst ? 'Volleys' : `Clash ${volleysFirst ? i : i + 1}`));
}

function shareOf(r: BattleRound): number {
  return r.aPower / Math.max(1, r.aPower + r.dPower);
}

/** Deterministic, replay-stable: the moments are read off the typed report,
 * in a fixed order: never sampled, never random. */
function decisiveMoments(report: BattleReport, labels: string[]): string[] {
  const out: string[] = [];
  const rounds = report.rounds;
  if (rounds.length >= 2) {
    let swingAt = 1;
    let swing = 0;
    for (let i = 1; i < rounds.length; i++) {
      const d = Math.abs(shareOf(rounds[i]) - shareOf(rounds[i - 1]));
      if (d > swing) { swing = d; swingAt = i; }
    }
    if (swing >= 0.08) {
      out.push(`${labels[swingAt]} turned the day: the balance swung ${Math.round(swing * 100)} points in one exchange.`);
    }
  }
  if (rounds.length >= 1) {
    let bloodAt = 0;
    let blood = -1;
    for (let i = 0; i < rounds.length; i++) {
      const d = rounds[i].aLoss + rounds[i].dLoss;
      if (d > blood) { blood = d; bloodAt = i; }
    }
    if (blood > 0) out.push(`${labels[bloodAt]} was the bloodiest: ${blood} ${blood === 1 ? 'hit' : 'hits'} told.`);
  }
  for (const e of report.events) {
    if (e.kind === 'heroDeath' || e.kind === 'lastStand' || e.kind === 'withdraw') out.push(e.text);
  }
  return out;
}

function beatIcon(kind: BattleEventNote['kind']): string {
  switch (kind) {
    case 'spell': return 'ember';
    case 'heroDeath':
    case 'heroWound': return 'hero';
    case 'withdraw': return 'banner';
    case 'lastStand': return 'swords';
  }
}

export function openBattleTheater(screen: GameScreen, report: BattleReport, preview: StakesPreview | null): void {
  const state = screen.state;
  const atk = lordDisplay(state, report.attacker.player);
  const def = lordDisplay(state, report.defender.player);
  const attackerWon = report.winner === 'attacker';
  const labels = roundLabels(report.rounds);

  // ---------------------------------------------------------- the stakes
  const modChips = (mods: BattleReport['aMods']): HTMLElement[] =>
    [...mods]
      .sort((a, b) => Math.abs(b.mult - 1) - Math.abs(a.mult - 1))
      .slice(0, 3)
      .map((m) => h('span', { class: `chip ${m.mult >= 1 ? 'chip-pos' : 'chip-neg'}` },
        `${m.label} ${m.mult >= 1 ? '+' : ''}${Math.round((m.mult - 1) * 100)}%`));

  const stakeSide = (side: BattleReport['attacker'], who: { name: string; color: string }, lordId: string | null): HTMLElement =>
    h('div', { class: 'theater-stake-side' },
      h('div', { class: 'theater-stake-head' },
        lordId ? sigilShield(lordId, 30) : h('span', { class: 'lord-swatch', style: { background: who.color } }),
        h('b', {}, who.name),
      ),
      h('div', { class: 'small' }, `${side.units.reduce((s, u) => s + u.count, 0)} companies · strength ${side.strength}`),
      side.heroNames.length > 0 ? h('div', { class: 'small muted' }, `Under ${side.heroNames.join(' and ')}`) : null,
      h('div', { class: 'theater-chips' }, ...modChips(side === report.attacker ? report.aMods : report.dMods)),
    );

  const atkLordId = report.attacker.player >= 0 ? state.players[report.attacker.player].lordId : null;
  const defLordId = report.defender.player >= 0 ? state.players[report.defender.player].lordId : null;
  const previewPct = preview ? Math.round(preview.winChance * 100) : null;
  const previewLabel = previewPct === null ? null : previewPct >= 100 ? '≥99%' : previewPct <= 0 ? '≤1%' : `${previewPct}%`;

  const stakes = h('div', { class: 'theater-stakes' },
    stakeSide(report.attacker, atk, atkLordId),
    h('div', { class: 'theater-vs' },
      h('span', { class: 'small-caps' }, 'against'),
      previewLabel !== null
        ? h('span', { class: 'small muted' }, `The augurs gave ${previewLabel}.`)
        : null,
    ),
    stakeSide(report.defender, def, defLordId),
  );

  // ----------------------------------------------------------- the field
  const chitRank = (side: BattleReport['attacker'], cls: string): HTMLElement =>
    h('div', { class: `theater-rank ${cls}` },
      ...side.units.map((u) => {
        const unitDef = UNITS[u.type];
        return h('span', { class: 'theater-chit', title: `${u.count}× ${unitDef.namePlural}` },
          h('span', { html: iconSvg(unitDef.icon, 15) }),
          h('span', { class: 'theater-chit-count' }, `×${u.count}`),
        );
      }),
    );

  const balanceFill = h('div', { class: 'theater-balance-a', style: { width: '50%', background: atk.color } });
  const balanceLabel = h('div', { class: 'small muted theater-balance-label' }, 'The lines form');
  const balance = h('div', { class: 'theater-balance-wrap' },
    h('div', { class: 'theater-balance', role: 'img', 'aria-label': 'The balance of strength as the battle unfolds' }, balanceFill),
    balanceLabel,
  );

  const field = h('div', { class: 'theater-field' },
    chitRank(report.attacker, 'theater-rank-a'),
    balance,
    chitRank(report.defender, 'theater-rank-d'),
  );

  // -------------------------------------------------------- the playback
  const roundsList = h('div', { class: 'theater-rounds' });
  const dots = report.rounds.map((_, i) =>
    h('button', {
      class: 'theater-dot',
      'aria-label': `Jump to ${labels[i]}`,
      onclick: () => jumpTo(i),
    }));
  const scrubber = report.rounds.length > 1 ? h('div', { class: 'theater-scrubber' }, ...dots) : null;

  let speed: SpeedId = savedSpeed();
  const speedBtns = SPEEDS.map((s) =>
    h('button', {
      class: `btn btn-quiet compact theater-speed${s.id === speed ? ' theater-speed-on' : ''}`,
      onclick: () => {
        speed = s.id;
        localStorage.setItem(SPEED_KEY, speed);
        for (const b of speedBtns) b.classList.toggle('theater-speed-on', b.textContent === s.label);
      },
    }, s.label));

  let revealed = 0;
  let timer: number | null = null;
  let finished = false;

  const renderRound = (i: number): HTMLElement => {
    const r = report.rounds[i];
    return h('div', { class: 'battle-round battle-round-live' },
      h('div', { class: 'small muted battle-round-label' }, labels[i]),
      h('div', { class: 'small battle-round-losses' },
        h('span', { class: r.aLoss > 0 ? 'neg' : 'muted' }, `−${r.aLoss}`),
        h('span', { class: 'muted' }, `${r.aPower} ⚖ ${r.dPower}`),
        h('span', { class: r.dLoss > 0 ? 'neg' : 'muted' }, `−${r.dLoss}`),
      ),
      ...r.notes.map((n) => h('div', { class: 'small italic muted battle-note' }, n)),
    );
  };

  const showRound = (i: number, withSound: boolean): void => {
    const r = report.rounds[i];
    roundsList.appendChild(renderRound(i));
    balanceFill.style.width = `${Math.round(shareOf(r) * 100)}%`;
    balanceLabel.textContent = `${labels[i]}: ${r.aPower} against ${r.dPower}`;
    dots[i]?.classList.add('theater-dot-past');
    if (withSound) audio.clash();
    roundsList.scrollTop = roundsList.scrollHeight;
  };

  // ------------------------------------------------------- the aftermath
  const lossSide = (side: BattleReport['attacker'], who: { name: string }, won: boolean): HTMLElement =>
    h('div', { class: `battle-side ${won ? 'battle-won' : ''}` },
      h('div', { class: 'battle-side-head' },
        h('b', {}, who.name),
        won ? h('span', { class: 'chip chip-win' }, 'holds the field') : null,
      ),
      ...side.units.map((u) => {
        const unitDef = UNITS[u.type];
        return h('div', { class: 'battle-unit-row' },
          h('span', { html: iconSvg(unitDef.icon, 14) }),
          h('span', { class: 'battle-unit-name' }, `${u.count}× ${unitDef.namePlural}`),
          u.lost > 0 ? h('span', { class: 'neg small' }, `−${u.lost}`) : h('span', { class: 'small muted' }, 'unbroken'),
        );
      }),
    );

  const whyDiffered = (): HTMLElement | null => {
    if (!preview || previewLabel === null) return null;
    const expectedAttacker = preview.winChance >= 0.5;
    if (expectedAttacker === attackerWon) {
      return h('p', { class: 'small muted' }, `The augurs gave ${previewLabel}, and the field agreed.`);
    }
    // an upset is the tail of the forecast, not a modifier it missed: every
    // strength on both sides was already weighed inside that number, so the
    // honest explanation is the rounds' own fortune (review R3)
    return h('p', { class: 'small' },
      `The augurs gave ${previewLabel}. The field ruled otherwise. Every strength on both sides was already weighed in that number; the rounds themselves fell the unlikely way, as ${PREVIEW_RUNS} sampled battles say they sometimes will. An unlikely outcome is not a wrong forecast.`,
    );
  };

  const aftermath = h('div', { class: 'theater-aftermath', style: { display: 'none' } },
    h('p', { class: 'battle-captured small-caps' },
      `${attackerWon ? atk.name : def.name} holds the field${report.captured ? `. ${report.provinceName} changes hands.` : '.'}`),
    h('div', { class: 'battle-sides' },
      lossSide(report.attacker, atk, attackerWon),
      lossSide(report.defender, def, !attackerWon),
    ),
    (() => {
      const moments = decisiveMoments(report, labels);
      return moments.length > 0
        ? h('div', { class: 'theater-moments' },
            h('div', { class: 'small-caps theater-moments-title' }, 'Decisive moments'),
            ...moments.map((m) => h('p', { class: 'small' }, `※ ${m}`)))
        : null;
    })(),
    whyDiffered(),
  );

  const beats = h('div', { class: 'theater-beats' });
  const renderBeat = (e: BattleEventNote): HTMLElement =>
    h('p', { class: `small battle-event battle-event-${e.kind}${e.kind === 'spell' ? ' battle-weave' : ''}` },
      h('span', { class: e.kind === 'spell' ? 'battle-weave-glyph' : '', html: iconSvg(beatIcon(e.kind), 13) }),
      ' ',
      e.text);

  let beatsShown = 0;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (timer !== null) { window.clearTimeout(timer); timer = null; }
    while (revealed < report.rounds.length) { showRound(revealed, false); revealed++; }
    while (beatsShown < report.events.length) { beats.appendChild(renderBeat(report.events[beatsShown])); beatsShown++; }
    aftermath.style.display = '';
    skipBtn.style.display = 'none';
    const last = report.rounds[report.rounds.length - 1];
    if (last) {
      balanceFill.style.width = `${Math.round(shareOf(last) * 100)}%`;
      balanceLabel.textContent = `${attackerWon ? atk.name : def.name} holds the field`;
    }
  };

  const msNow = (): number => SPEEDS.find((s) => s.id === speed)!.ms;
  const step = (): void => {
    if (revealed < report.rounds.length) {
      showRound(revealed, true);
      revealed++;
      timer = window.setTimeout(step, msNow());
    } else if (beatsShown < report.events.length) {
      beats.appendChild(renderBeat(report.events[beatsShown]));
      beatsShown++;
      timer = window.setTimeout(step, msNow());
    } else {
      finish();
    }
  };

  const jumpTo = (i: number): void => {
    if (finished) return;
    if (timer !== null) { window.clearTimeout(timer); timer = null; }
    while (revealed <= Math.min(i, report.rounds.length - 1)) { showRound(revealed, false); revealed++; }
    timer = window.setTimeout(step, msNow());
  };

  const skipBtn = h('button', { class: 'btn btn-quiet compact', onclick: finish }, 'Skip to the outcome');

  const content = h('div', { class: 'battle-body theater-body' },
    stakes,
    field,
    scrubber,
    roundsList,
    beats,
    aftermath,
    h('div', { class: 'theater-controls' },
      h('div', { class: 'theater-speeds' }, ...speedBtns),
      skipBtn,
      h('button', { class: 'btn', onclick: () => { finish(); modal.close(); } }, 'Close the report'),
    ),
  );

  const modal = openModal(`The battle for ${report.provinceName}`, content, { wide: true, onClose: finish });
  timer = window.setTimeout(step, 350);
}
