/**
 * Osperan's column: the war chronicle, newest at the bottom, filtered to
 * what this viewer may know. Collapsible on small screens.
 *
 * Digest mode (default on, persisted): each season's routine lines fold
 * behind Osperan's one-line season digest, entries group under collapsible
 * season headers, and only the current season starts expanded. Digest off
 * is exactly the old flat feed. What is and isn't digested is decided by
 * filterChronicle in the engine's narrator (pure, shared with the tests).
 */
import type { ChronicleEntry } from '../../engine/types';
import { filterChronicle } from '../../engine/narrator';
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
const DIGEST_KEY = 'rie-digest';
let digestOn = localStorage.getItem(DIGEST_KEY) !== 'off';
/** Reader's explicit open/close choices per season header, on top of the
 * default (only the current season open). */
const seasonChoice: Record<number, boolean> = {};
/** How many trailing seasons render at once; older ones wait behind one
 * button, so a sixty-season war never mounts sixty seasons of DOM. */
const SEASON_WINDOW = 12;
let seasonsShown = SEASON_WINDOW;
/** Unread watermark: how much of the visible feed the reader has seen.
 * Session-scoped and per-campaign; reading to the bottom advances it. */
let readMark = 0;
let readMarkSeed = '';

/** The reading order of an entry: ceremonies command the page, decisions
 * demanded a choice, alerts touched your banner, chronicle is the weather. */
function tierOf(entry: ChronicleEntry, viewer: number): 'ceremony' | 'decision' | 'alert' | 'chronicle' {
  if (entry.ceremony) return 'ceremony';
  if (entry.kind === 'event') return 'decision';
  if ((entry.kind === 'war' || entry.kind === 'diplomacy') && entry.about === viewer) return 'alert';
  return 'chronicle';
}

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
  const visible = filterChronicle(
    state.chronicle
      .filter((e) => e.privateTo === undefined || e.privateTo === viewer)
      .filter((e) => !(state.settings.veteranChronicle && e.kind === 'teaching'))
      .filter((e) => filter === 'all' || e.kind === filter || (filter === 'realm' && e.kind === 'turn')),
    digestOn,
  );
  // digest off = the old flat feed, digest on = every season, grouped
  const entries = digestOn ? visible : visible.slice(-60);

  // the unread watermark follows the campaign, not the tab
  if (readMarkSeed !== state.seed) {
    readMarkSeed = state.seed;
    readMark = visible.length;
    seasonsShown = SEASON_WINDOW;
  }
  const unread = Math.max(0, visible.length - readMark);

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
    'aria-label': collapsed
      ? `Open the chronicle${unread > 0 ? ` — ${unread} unread` : ''}`
      : 'Close the chronicle',
    onclick: () => {
      collapsed = !collapsed;
      renderChronicleFeed(screen, root);
    },
  },
    h('span', { html: iconSvg('quill', 16) }),
    collapsed ? ' The Chronicle' : '',
    collapsed && unread > 0 ? h('span', { class: 'badge' }, String(unread)) : null,
  );

  root.appendChild(toggle);
  if (collapsed) return;
  // what arrived since the last full reading gets a quiet ember dot;
  // reading to the bottom marks everything read for next time
  const unreadSet = new Set(visible.slice(readMark));
  if (wasAtBottom) readMark = visible.length;

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
      h('button', {
        class: `chronicle-filter chronicle-digest-chip ${digestOn ? 'active' : ''}`,
        'aria-pressed': String(digestOn),
        'aria-label': 'Digest mode',
        title: "Digest — fold each season's routine lines into Osperan's one-line summary",
        onclick: () => {
          digestOn = !digestOn;
          localStorage.setItem(DIGEST_KEY, digestOn ? 'on' : 'off');
          renderChronicleFeed(screen, root);
        },
      }, h('span', { html: iconSvg('info', 13) }), 'Digest'),
    ),
    ...(digestOn
      ? renderSeasons(screen, root, entries, state.turn, viewer, unreadSet)
      : entries.map((entry) => renderEntry(entry, viewer, unreadSet))),
  );
  root.appendChild(feed);
  requestAnimationFrame(() => {
    feed.scrollTop = wasAtBottom ? feed.scrollHeight : prevScroll;
  });
}

/** Group entries by season under collapsible headers. Only the current
 * season starts open; a collapsed season still shows its digest line and
 * its ceremonies (those are never hidden), so even a sixty-season war
 * reads in a couple of screens. Mirrors engine digestView — keep in step. */
function renderSeasons(
  screen: GameScreen,
  root: HTMLElement,
  entries: ChronicleEntry[],
  currentTurn: number,
  viewer: number,
  unreadSet: Set<ChronicleEntry>,
): HTMLElement[] {
  const seasons: { turn: number; items: ChronicleEntry[] }[] = [];
  for (const e of entries) {
    const last = seasons[seasons.length - 1];
    if (last && last.turn === e.turn) last.items.push(e);
    else seasons.push({ turn: e.turn, items: [e] });
  }
  const out: HTMLElement[] = [];
  // DOM windowing: only the trailing seasons mount; the rest wait behind
  // one button, so a long war stays a light page
  if (seasons.length > seasonsShown) {
    const hidden = seasons.length - seasonsShown;
    out.push(h('button', {
      class: 'btn btn-quiet compact chronicle-unroll',
      onclick: () => {
        seasonsShown += SEASON_WINDOW;
        renderChronicleFeed(screen, root);
      },
    }, `Unroll ${Math.min(SEASON_WINDOW, hidden)} earlier ${hidden === 1 ? 'season' : 'seasons'} (${hidden} folded)`));
    seasons.splice(0, hidden);
  }
  for (const season of seasons) {
    const open = seasonChoice[season.turn] ?? (season.turn === currentTurn);
    const shown = open ? season.items : season.items.filter((e) => e.digest || e.ceremony);
    const folded = season.items.length - shown.length;
    out.push(h('button', {
      class: `chronicle-season ${open ? 'open' : ''}`,
      'aria-expanded': String(open),
      'aria-label': `Season ${season.turn}, ${open ? 'expanded' : `collapsed, ${folded} more ${folded === 1 ? 'entry' : 'entries'}`}`,
      onclick: () => {
        seasonChoice[season.turn] = !open;
        renderChronicleFeed(screen, root);
      },
    },
      h('span', { class: 'chronicle-season-chevron' }, open ? '▾' : '▸'),
      `Season ${season.turn}`,
      h('span', { class: 'chronicle-season-count small' }, open ? String(season.items.length) : folded > 0 ? `+${folded}` : ''),
    ));
    for (const entry of shown) out.push(renderEntry(entry, viewer, unreadSet));
  }
  return out;
}

function renderEntry(entry: ChronicleEntry, viewer: number, unreadSet: Set<ChronicleEntry>): HTMLElement {
  const tier = tierOf(entry, viewer);
  return h('div', {
    class: `chronicle-entry chronicle-tier-${tier} ${entry.ceremony ? 'chronicle-ceremony' : ''} ${entry.digest ? 'chronicle-digest-entry' : ''} chronicle-${entry.kind}`,
  },
    h('div', { class: 'chronicle-meta small muted' },
      h('span', { html: iconSvg(KIND_ICON[entry.kind] ?? 'quill', 12) }),
      `Season ${entry.turn}`,
      entry.privateTo !== undefined ? h('span', { class: 'chip chip-magic', style: { marginLeft: '0.4em' } }, 'for your eyes') : null,
      unreadSet.has(entry) ? h('span', { class: 'chronicle-unread-dot', title: 'New since your last reading' }) : null,
    ),
    h('div', { class: 'chronicle-text' }, entry.text),
  );
}
