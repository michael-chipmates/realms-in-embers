/**
 * The Province Navigator: the map as rows. A semantic twin of the war
 * table for keyboards and screen readers, and a fast index for everyone
 * else. It shows exactly what the painted map shows and not one thing
 * more: the same seenBy() set gates every row, armies appear only where
 * the renderer would draw them, and the unseen realm is a count, not a
 * list. Selecting a row selects on the map; the map's selection is the
 * highlighted row when the Navigator opens.
 */
import { TERRAIN } from '../../engine/content/world';
import { SITE_NAMES } from '../../engine/content/names';
import { provinceIncome } from '../../engine/economy';
import { armiesIn, seenBy } from '../../engine/helpers';
import type { Province } from '../../engine/types';
import { h, mount } from '../dom';
import { lordDisplay } from '../format';
import { iconSvg } from '../icons';
import { openModal } from '../modal';
import type { GameScreen } from '../screens/game';

/** Every key the war table answers to, on one card. */
export function openKeysOverlay(screen: GameScreen): void {
  void screen;
  const KEYS: [string, string][] = [
    ['E', 'End the Season'],
    ['B', 'The Council Brief'],
    ['H', 'Court & heroes'],
    ['M', 'Magic & rites'],
    ['Q', 'Quests & the Saga'],
    ['D', 'The other lords'],
    ['L', 'Ledger & victory'],
    ['P', 'The Province Navigator'],
    ['C', 'The Codex'],
    ['? ', 'This card'],
    ['← →', 'Cycle your provinces'],
    ['Enter', 'Select the army standing there'],
    ['Esc', 'Clear the selection, or stand down an armed spell'],
  ];
  openModal('The Keys', h('div', { class: 'keys-body' },
    ...KEYS.map(([k, what]) => h('div', { class: 'keys-row' },
      h('kbd', { class: 'keys-key' }, k),
      h('span', { class: 'small' }, what),
    )),
    h('p', { class: 'small muted', style: { marginTop: '0.5rem' } },
      'Keys wait politely while you type in any field. The Codex (C) holds the rules themselves.'),
  ));
}

export function openNavigatorOverlay(screen: GameScreen): void {
  const body = h('div', { class: 'overlay-body navigator-body' });
  openModal('The Province Navigator', body, { wide: true });

  const groupsEl = h('div', { class: 'nav-groups' });
  const filterInput = h('input', {
    class: 'nav-filter',
    type: 'search',
    placeholder: 'Find a province, terrain, or lord…',
    'aria-label': 'Filter provinces',
    oninput: () => renderGroups(screen, groupsEl, filterInput.value),
  }) as HTMLInputElement;

  mount(body, filterInput, groupsEl);
  renderGroups(screen, groupsEl, '');
  groupsEl.querySelector('.nav-row-selected')?.scrollIntoView({ block: 'center' });
}

function renderGroups(screen: GameScreen, into: HTMLElement, filter: string): void {
  const state = screen.state;
  const viewer = screen.viewerId();
  const visible = state.settings.fogOfWar ? seenBy(state, viewer) : null;
  const known = state.provinces.filter((p) => visible === null || visible.has(p.id));
  const unseenCount = state.provinces.length - known.length;

  const needle = filter.trim().toLowerCase();
  const matches = (p: Province): boolean => {
    if (needle === '') return true;
    const owner = p.owner >= 0 ? lordDisplay(state, p.owner).name : 'no banner';
    return `${p.name} ${TERRAIN[p.terrain].name} ${owner} ${p.site ? SITE_NAMES[p.site] : ''}`
      .toLowerCase().includes(needle);
  };

  const sections: { title: string; provinces: Province[]; own?: boolean }[] = [];
  const mine = known.filter((p) => p.owner === viewer && matches(p));
  if (mine.length > 0) sections.push({ title: 'Your realm', provinces: mine, own: true });
  for (const rival of state.players.filter((pl) => pl.alive && pl.id !== viewer)) {
    const theirs = known.filter((p) => p.owner === rival.id && matches(p));
    if (theirs.length > 0) sections.push({ title: lordDisplay(state, rival.id).name, provinces: theirs });
  }
  const free = known.filter((p) => p.owner < 0 && matches(p));
  if (free.length > 0) sections.push({ title: 'No banner', provinces: free });

  const parts: HTMLElement[] = sections.map((g) =>
    h('div', { class: 'nav-group' },
      h('h3', { class: 'settings-head' }, `${g.title} · ${g.provinces.length}`),
      ...[...g.provinces].sort((a, b) => a.name.localeCompare(b.name)).map((p) => rowFor(screen, p, !!g.own, into, filter)),
    ));
  if (parts.length === 0) {
    parts.push(h('p', { class: 'muted italic', style: { padding: '0.6rem' } }, 'Nothing by that name on the known map.'));
  }
  if (unseenCount > 0) {
    parts.push(h('p', { class: 'small muted', style: { padding: '0.2rem 0.6rem' } },
      `Beyond the fog: ${unseenCount} ${unseenCount === 1 ? 'province' : 'provinces'} unseen.`));
  }
  mount(into, ...parts);
}

function rowFor(screen: GameScreen, p: Province, own: boolean, list: HTMLElement, filter: string): HTMLElement {
  const state = screen.state;
  const selected = screen.sel.provinceId === p.id;
  const owner = p.owner >= 0 ? lordDisplay(state, p.owner) : null;
  const armies = armiesIn(state, p.id);
  const walls = p.buildings.some((b) => b.startsWith('walls'));
  const seals = p.mods.length;

  const bits: (HTMLElement | null)[] = [
    h('span', {
      class: 'lord-swatch',
      style: owner ? { background: owner.color } : { background: 'transparent', border: '1px solid rgba(201, 162, 39, 0.4)' },
    }),
    h('span', { class: 'nav-name' }, p.name),
    h('span', { class: 'small muted nav-terrain' }, `${TERRAIN[p.terrain].name}${p.site ? ` · ${SITE_NAMES[p.site]}` : ''}`),
    own ? h('span', { class: 'small nav-num' }, `${provinceIncome(state, p).total} `, h('span', { class: 'muted', html: iconSvg('gold', 11) })) : null,
    own ? h('span', { class: `small nav-num ${p.order < 35 ? 'neg' : ''}` }, `${Math.round(p.order)} order`) : null,
    armies.length > 0
      ? h('span', { class: 'small nav-num' }, `${armies.reduce((s, a) => s + a.units.length, 0)} `, h('span', { class: 'muted', html: iconSvg('banner', 11) }))
      : null,
    walls ? h('span', { class: 'small muted', html: iconSvg('wall', 12), title: 'Walled' }) : null,
    seals > 0 ? h('span', { class: 'small muted', html: iconSvg('ward', 12), title: `${seals} enchantment${seals === 1 ? '' : 's'}` }) : null,
  ];

  return h('button', {
    class: `nav-row${selected ? ' nav-row-selected' : ''}`,
    ...(selected ? { 'aria-current': 'true' } : {}),
    onclick: () => {
      screen.select(p.id, null);
      screen.panTo(p.id);
      renderGroups(screen, list, filter);
    },
  }, ...bits);
}
