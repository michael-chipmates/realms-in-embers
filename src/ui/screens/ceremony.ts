/**
 * Ceremony: the big moments stop the room. A dark overlay, Osperan's words
 * writ large, one quiet button. Never for small news; never a popup.
 */
import type { Effect } from '../../engine/types';
import { h } from '../dom';
import { iconSvg } from '../icons';
import { audio } from '../audio';
import type { GameScreen } from './game';

const CEREMONY_ICON: Record<string, string> = {
  heroDied: 'hero',
  eliminated: 'flag',
  victory: 'crownSmall',
  sagaRitual: 'ember',
};

let ceremonyShowing = false;
const queue: { icon: string; title: string; text: string }[] = [];

/** Scan effects for ceremony-grade chronicle entries and stage them. */
export function presentCeremonies(screen: GameScreen, effects: Effect[]): void {
  const state = screen.state;
  const viewer = screen.viewerId();
  for (const effect of effects) {
    if (effect.e === 'heroDied' && effect.owner === viewer) {
      const entry = [...state.chronicle].reverse().find((c) => c.ceremony && c.text.includes(effect.name));
      queue.push({
        icon: CEREMONY_ICON.heroDied,
        title: `${effect.name} has fallen`,
        text: entry?.text ?? `${effect.name} died ${effect.cause}.`,
      });
    } else if (effect.e === 'eliminated') {
      const entry = [...state.chronicle].reverse().find((c) => c.ceremony && c.kind === 'ceremony');
      queue.push({
        icon: CEREMONY_ICON.eliminated,
        title: 'A banner falls',
        text: entry?.text ?? 'A claimant has passed out of the war.',
      });
    }
  }
  drainQueue(screen);
}

function drainQueue(screen: GameScreen): void {
  if (ceremonyShowing || queue.length === 0) return;
  if (screen.state.phase === 'ended') {
    queue.length = 0; // the end screen owns the finale
    return;
  }
  const item = queue.shift()!;
  ceremonyShowing = true;
  audio.bell();

  const overlay = h('div', { class: 'ceremony-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': item.title },
    h('div', { class: 'ceremony-center' },
      h('div', { class: 'ceremony-icon', html: iconSvg(item.icon, 44) }),
      h('h2', { class: 'title-display ceremony-title' }, item.title),
      h('div', { class: 'rule-flourish', style: { width: 'min(360px, 60vw)', margin: '0.8rem auto' } }, '❧'),
      h('p', { class: 'ceremony-text' }, item.text),
      h('button', {
        class: 'btn', style: { marginTop: '1.4rem' },
        onclick: () => {
          overlay.classList.add('ceremony-out');
          window.setTimeout(() => {
            overlay.remove();
            ceremonyShowing = false;
            drainQueue(screen);
          }, screen.app.settings.reducedMotion ? 0 : 300);
        },
      }, 'Let the chronicle keep it'),
    ),
  );
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.querySelector('button')?.focus());
}
