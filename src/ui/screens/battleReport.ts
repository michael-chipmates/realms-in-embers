/**
 * The battle report: a readable account of a resolved fight — rounds as a
 * swinging balance, casualties by company, and everything the field said.
 * (The engine already decided everything; this only presents.)
 */
import { UNITS } from '../../engine/content/units';
import type { BattleReport } from '../../engine/types';
import { h } from '../dom';
import { lordDisplay } from '../format';
import { iconSvg } from '../icons';
import { openModal } from '../modal';
import { audio } from '../audio';
import type { GameScreen } from './game';

export function openBattleReport(screen: GameScreen, report: BattleReport): void {
  const state = screen.state;
  const atk = lordDisplay(state, report.attacker.player);
  const def = lordDisplay(state, report.defender.player);
  const attackerWon = report.winner === 'attacker';

  const sideBlock = (side: BattleReport['attacker'], name: string, color: string, won: boolean) =>
    h('div', { class: `battle-side ${won ? 'battle-won' : ''}` },
      h('div', { class: 'battle-side-head' },
        h('span', { class: 'lord-swatch', style: { background: color } }),
        h('b', {}, name),
        won ? h('span', { class: 'chip chip-win' }, 'holds the field') : null,
      ),
      ...side.units.map((u) => {
        const unitDef = UNITS[u.type];
        return h('div', { class: 'battle-unit-row' },
          h('span', { html: iconSvg(unitDef.icon, 14) }),
          h('span', { class: 'battle-unit-name' }, `${u.count}× ${unitDef.namePlural}`),
          u.lost > 0
            ? h('span', { class: 'neg small' }, `−${u.lost}`)
            : h('span', { class: 'small muted' }, 'unbroken'),
        );
      }),
      side.heroNames.length > 0
        ? h('p', { class: 'small muted', style: { marginTop: '0.3rem' } }, `Under ${side.heroNames.join(' and ')}`)
        : null,
    );

  // rounds reveal one by one — a playback, not a spreadsheet. Skippable,
  // timer-driven (never framerate-bound), and closing the modal never blocks.
  const reduced = screen.app.settings.reducedMotion;
  const roundEls = report.rounds.map((r, i) => {
    const total = Math.max(1, r.aPower + r.dPower);
    const aShare = Math.round((r.aPower / total) * 100);
    const el = h('div', { class: 'battle-round', style: reduced ? {} : { opacity: '0', transition: 'opacity 240ms' } },
      h('div', { class: 'small muted battle-round-label' }, i === 0 && report.rounds.length > 1 && r.notes.some((n) => n.includes('Arrow')) ? 'Volleys' : `Clash ${i + (report.rounds[0]?.notes.some((n) => n.includes('Arrow')) ? 0 : 1)}`),
      h('div', { class: 'battle-balance', role: 'img', 'aria-label': `Strength ${r.aPower} against ${r.dPower}` },
        h('div', { class: 'battle-balance-a', style: { width: `${aShare}%` } }),
      ),
      h('div', { class: 'small battle-round-losses' },
        h('span', { class: r.aLoss > 0 ? 'neg' : 'muted' }, `−${r.aLoss}`),
        h('span', { class: 'muted' }, `${r.aPower} ⚖ ${r.dPower}`),
        h('span', { class: r.dLoss > 0 ? 'neg' : 'muted' }, `−${r.dLoss}`),
      ),
      ...r.notes.map((n) => h('div', { class: 'small italic muted battle-note' }, n)),
    );
    return el;
  });
  const tail: HTMLElement[] = [];
  const rounds = h('div', { class: 'battle-rounds' }, ...roundEls);
  let revealTimer: number | null = null;
  const revealAll = (): void => {
    if (revealTimer !== null) {
      window.clearTimeout(revealTimer);
      revealTimer = null;
    }
    for (const el of roundEls) el.style.opacity = '1';
    for (const el of tail) el.style.opacity = '1';
    skipBtn.style.display = 'none';
  };
  const skipBtn = h('button', { class: 'btn btn-quiet compact', onclick: revealAll }, 'Skip to the outcome');
  if (reduced) {
    skipBtn.style.display = 'none';
  } else {
    let i = 0;
    const step = (): void => {
      if (i < roundEls.length) {
        roundEls[i].style.opacity = '1';
        audio.clash();
        i++;
        revealTimer = window.setTimeout(step, 520);
      } else {
        revealAll();
      }
    };
    revealTimer = window.setTimeout(step, 300);
  }

  const eventsEl = report.events.length > 0
    ? h('div', { class: 'battle-events', style: reduced ? {} : { opacity: '0', transition: 'opacity 300ms' } },
        ...report.events.map((e) => h('p', { class: `small battle-event battle-event-${e.kind}` }, e.text)))
    : null;
  const capturedEl = report.captured
    ? h('p', { class: 'battle-captured small-caps', style: reduced ? {} : { opacity: '0', transition: 'opacity 300ms' } }, `${report.provinceName} changes hands.`)
    : null;
  if (eventsEl) tail.push(eventsEl);
  if (capturedEl) tail.push(capturedEl);

  const content = h('div', { class: 'battle-body' },
    h('div', { class: 'battle-sides' },
      sideBlock(report.attacker, atk.name, atk.color, attackerWon),
      sideBlock(report.defender, def.name, def.color, !attackerWon),
    ),
    rounds,
    eventsEl,
    capturedEl,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '0.6rem' } },
      skipBtn,
      h('button', { class: 'btn', onclick: () => { revealAll(); modal.close(); } }, 'Close the account'),
    ),
  );

  const modal = openModal(`The battle for ${report.provinceName}`, content, { wide: true });
}
