/**
 * Osperan's column: the war chronicle, newest at the bottom, filtered to
 * what this viewer may know. Collapsible on small screens.
 */
import type { ChronicleEntry } from '../../engine/types';
import { clear, h } from '../dom';
import { artSlot } from '../art';
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
let filter: 'all' | ChronicleEntry['kind'] = 'all';

const FILTERS: { key: 'all' | ChronicleEntry['kind']; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'quill' },
  { key: 'war', label: 'War', icon: 'swords' },
  { key: 'hero', label: 'Heroes', icon: 'hero' },
  { key: 'magic', label: 'Magic', icon: 'ember' },
  { key: 'diplomacy', label: 'Lords', icon: 'handshake' },
  { key: 'realm', label: 'Realm', icon: 'order' },
  { key: 'event', label: 'Events', icon: 'danger' },
];

export function renderChronicleFeed(screen: GameScreen, root: HTMLElement): void {
  const state = screen.state;
  const viewer = screen.viewerId();
  const entries = state.chronicle
    .filter((e) => e.privateTo === undefined || e.privateTo === viewer)
    .filter((e) => !(state.settings.veteranChronicle && e.kind === 'teaching'))
    .filter((e) => filter === 'all' || e.kind === filter || (filter === 'realm' && e.kind === 'turn'))
    .slice(-60);

  // remember where the reader was: yank to the bottom only if they were there
  const prevFeed = root.querySelector<HTMLElement>('.chronicle-feed');
  const wasAtBottom = !prevFeed
    || prevFeed.scrollTop + prevFeed.clientHeight >= prevFeed.scrollHeight - 40;
  const prevScroll = prevFeed?.scrollTop ?? 0;

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
      artSlot('osperan', h('span', { class: 'osperan-emblem', html: iconSvg('quill', 22) }), { className: 'art-osperan', alt: 'Osperan the Unresting at his ledger' }),
      h('div', { class: 'small-caps' }, 'The Chronicle of the Sundered Age'),
      h('div', { class: 'small chronicle-byline italic' }, 'as set down by Osperan the Unresting'),
    ),
    h('div', { class: 'chronicle-filters', role: 'group', 'aria-label': 'Chronicle filters' },
      ...FILTERS.map((f) =>
        h('button', {
          class: `chronicle-filter ${filter === f.key ? 'active' : ''}`,
          'aria-pressed': String(filter === f.key),
          'aria-label': f.label,
          title: f.label,
          onclick: () => {
            filter = f.key;
            renderChronicleFeed(screen, root);
          },
        }, h('span', { html: iconSvg(f.icon, 13) }), f.label),
      ),
    ),
    ...entries.map((entry) => renderEntry(screen, entry)),
  );
  root.appendChild(feed);
  requestAnimationFrame(() => {
    feed.scrollTop = wasAtBottom ? feed.scrollHeight : prevScroll;
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
