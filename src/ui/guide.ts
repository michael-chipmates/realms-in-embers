/**
 * The First Ember: a guided first chronicle. Not a tutorial fork: a real
 * game on a fixed seed, with a quiet card that watches the actual action
 * log and steps forward when the real thing has really happened. Nothing
 * here touches the engine; the guide reads state and log, never writes.
 * Skippable at any moment, and it never comes back uninvited.
 */
import type { GameState } from '../engine/types';
import { h } from './dom';
import { audio } from './audio';
import type { GameScreen } from './screens/game';

export const FIRST_EMBER_DONE_KEY = 'rie-first-ember-done';

interface GuideStep {
  title: string;
  /** Plain teaching voice: one thing to do, and why it matters. */
  body: string;
  done: (screen: GameScreen, state: GameState) => boolean;
}

const logged = (state: GameState, t: string): boolean =>
  state.log.some((l) => l.player === 0 && l.action.t === t);

const STEPS: GuideStep[] = [
  {
    title: 'Your seat',
    body: 'The province flying your banner is your seat. Lose it and the realm shakes. Select it to open its ledger: land, coin, order, works.',
    done: (screen, state) => screen.sel.provinceId === state.players[0].seatProvince,
  },
  {
    title: 'Raise works',
    body: 'Every province pays its way. In Raise works, queue any building. The cost in gold and seasons is printed on the button, and the tooltip names every cause.',
    done: (_screen, state) => logged(state, 'build'),
  },
  {
    title: 'Muster a company',
    body: 'Armies are companies under a banner. In Muster companies, queue one. It stands ready next season, and wages come due every season after.',
    done: (_screen, state) => logged(state, 'recruit'),
  },
  {
    title: 'March',
    body: 'Select your army, then a glowing province. The realm beyond your sight is fog until your banners walk it. Crossed swords mean a fight, and the odds, itemized, are shown before you commit to anything.',
    done: (_screen, state) => logged(state, 'moveArmy'),
  },
  {
    title: 'Close the season',
    body: 'End the Season (E). Rivals move, coin arrives, queues finish their work. The realm breathes in seasons: nothing happens until you let it.',
    done: (_screen, state) => state.turn > 1 || logged(state, 'endTurn'),
  },
  {
    title: 'The race',
    body: 'Open the Ledger (L). Five endings, and someone is already leading each race. From here on, every season is a move in one of them.',
    done: (screen) => screen.ledgerSeen,
  },
];

const CLOSING =
  'That is the whole of it: provinces pay, companies march, seasons turn, and the Ledger keeps the score. The rest is statecraft. This realm is yours to play on.';

export class FirstEmberGuide {
  private step = 0;
  private el: HTMLElement | null = null;
  private live: HTMLElement | null = null;
  private finished = false;

  onUpdate(screen: GameScreen): void {
    if (this.finished) return;
    // steps advance in order, but a player who raced ahead is not held back
    while (this.step < STEPS.length && STEPS[this.step].done(screen, screen.state)) {
      this.step++;
      if (this.step <= STEPS.length) audio.quillScratch();
    }
    this.render(screen);
  }

  private render(screen: GameScreen): void {
    if (!this.el) {
      this.live = h('div', { class: 'guide-step-body', 'aria-live': 'polite' });
      this.el = h('aside', { class: 'guide-card', role: 'complementary', 'aria-label': 'The First Ember, a guided start' });
      // anchored inside the war table, so it can never cover the topbar
      (screen.el.querySelector('.war-table') ?? screen.el).appendChild(this.el);
    }
    const done = this.step >= STEPS.length;
    const parts: (HTMLElement | null)[] = [];
    parts.push(h('div', { class: 'guide-head' },
      h('span', { class: 'small-caps guide-title' }, 'The First Ember'),
      h('span', { class: 'small muted' }, done ? 'complete' : `${this.step + 1} of ${STEPS.length}`),
    ));
    if (this.live) {
      const step = STEPS[this.step];
      this.live.replaceChildren(
        h('b', {}, done ? 'The table is yours' : step.title),
        h('p', { class: 'small' }, done ? CLOSING : step.body),
      );
      parts.push(this.live);
    }
    parts.push(h('div', { class: 'guide-dots' },
      ...STEPS.map((_, i) => h('span', { class: `guide-dot${i < this.step ? ' guide-dot-done' : i === this.step ? ' guide-dot-now' : ''}` })),
    ));
    parts.push(h('div', { class: 'guide-actions' },
      h('button', {
        class: 'btn btn-quiet compact',
        onclick: () => this.dismiss(),
      }, done ? 'Furl the guide' : 'Set the guide aside'),
    ));
    this.el.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  }

  private dismiss(): void {
    this.finished = true;
    localStorage.setItem(FIRST_EMBER_DONE_KEY, '1');
    this.el?.remove();
    this.el = null;
  }

  dispose(): void {
    this.el?.remove();
    this.el = null;
    this.finished = true;
  }
}
