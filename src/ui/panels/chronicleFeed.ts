/**
 * Osperan's column: the war chronicle, newest at the bottom, filtered to
 * what this viewer may know. Collapsible on small screens.
 */
import type { ChronicleEntry } from '../../engine/types';
import { clear, h } from '../dom';
import { iconSvg } from '../icons';
import type { GameScreen } from '../screens/game';

const KIND_ICON: Record<ChronicleEntry['kind'], string> = {
  war: 'swords',
  hero: 'hero',
  magic: 'ember',
  realm: 'order',
  diplomacy: 'handshake',
  event: 'danger',
  teaching: 'info',
  ceremony: 'crownSmall',
  turn: 'quill',
};

let collapsed = window.innerWidth < 900;

export function renderChronicleFeed(screen: GameScreen, root: HTMLElement): void {
  const state = screen.state;
  const viewer = screen.viewerId();
  const entries = state.chronicle
    .filter((e) => e.privateTo === undefined || e.privateTo === viewer)
    .filter((e) => !(state.settings.veteranChronicle && e.kind === 'teaching'))
    .slice(-60);

  clear(root);
  root.classList.toggle('chronicle-collapsed', collapsed);

  const toggle = h('button', {
    class: 'chronicle-toggle btn btn-quiet',
    'aria-expanded': String(!collapsed),
    'aria-label': collapsed ? 'Open the chronicle' : 'Close the chronicle',
    onclick: () => {
      collapsed = !collapsed;
      renderChronicleFeed(screen, root);
    },
  }, h('span', { html: iconSvg('quill', 16) }), collapsed ? ' The Chronicle' : '');

  root.appendChild(toggle);
  if (collapsed) return;

  const feed = h('div', { class: 'chronicle-feed' },
    h('div', { class: 'chronicle-heading' },
      h('div', { class: 'small-caps' }, 'The Chronicle of the Sundered Age'),
      h('div', { class: 'small muted italic' }, 'as set down by Osperan the Unresting'),
    ),
    ...entries.map((entry) => renderEntry(screen, entry)),
  );
  root.appendChild(feed);
  requestAnimationFrame(() => {
    feed.scrollTop = feed.scrollHeight;
  });
}

function renderEntry(screen: GameScreen, entry: ChronicleEntry): HTMLElement {
  return h('div', { class: `chronicle-entry ${entry.ceremony ? 'chronicle-ceremony' : ''} chronicle-${entry.kind}` },
    h('div', { class: 'chronicle-meta small muted' },
      h('span', { html: iconSvg(KIND_ICON[entry.kind] ?? 'quill', 12) }),
      `Season ${entry.turn}`,
      entry.privateTo !== undefined ? h('span', { class: 'chip chip-magic', style: { marginLeft: '0.4em' } }, 'for your eyes') : null,
    ),
    h('div', { class: 'chronicle-text' }, entry.text),
  );
}
