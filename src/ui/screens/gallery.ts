/**
 * The lord gallery — choosing a banner is the set piece, solo and online.
 * One lord at a time, painted large: portrait, creed, both abilities,
 * temperament in ink, and one dry line from the chronicler who has
 * buried most of these families at least once.
 *
 * Scroll-safe by the standing rule: the overlay flexes, the card takes
 * margin:auto and overflow-y:auto, and every button stays reachable at 320px.
 */
import { CREEDS, TERRAIN } from '../../engine/content/world';
import { LORDS, type LordDef } from '../../engine/content/lords';
import type { Creed } from '../../engine/types';
import { artSlot } from '../art';
import { h, mount } from '../dom';
import { sigilShield } from '../heraldry';
import { trapFocus } from '../modal';
import { audio } from '../audio';

/** Osperan's margin note on each claimant. Presentation copy, deliberately
 * not in the engine content — the chronicle itself never says these aloud. */
const OSPERAN_LINES: Record<string, string> = {
  seraphine: 'She will pray for your soldiers. Then she will spend them. Both sincerely.',
  aldric: 'Two coronations and not one lesson between them. Magnificent, though.',
  halvard: 'The only claimant who reads a wall the way others read poetry.',
  lyra: 'Wakes the whole camp singing. Some enemies surrender just to sleep.',
  ulvra: 'The mountain sent her down so it would not have to come itself.',
  maera: 'Talks to the bog. The bog, I note, has never once been wrong.',
  cormac: 'He has outlived three of my chapters. Trees keep excellent time.',
  branwen: 'Prices everything. Including, I suspect, this description.',
  corvas: 'Read anything he hands you twice. The second time, backwards.',
  nyssa: 'I never see her enter the chronicle. She is simply, suddenly, in it.',
  morrikan: 'He and death have an understanding. Death appears to be losing.',
  vaelia: 'The crows follow her the way scholars follow grants.',
};

const PERSONALITY_LABELS: [keyof LordDef['personality'], string][] = [
  ['aggression', 'War appetite'],
  ['greed', 'Gold hunger'],
  ['mysticism', 'Emberlight'],
  ['loyalty', 'Keeps faith'],
  ['pride', 'Pride'],
];

export interface GalleryOptions {
  /** Header line above the gallery, e.g. whose banner is being chosen. */
  title?: string;
  initial?: string | null;
  /** Lord ids already claimed elsewhere — shown, but not pickable. */
  taken?: string[];
  onPick: (lordId: string) => void;
  /** "Let fate deal" — omit to hide the option. */
  onFate?: () => void;
  onCancel?: () => void;
}

export function openLordGallery(opts: GalleryOptions): void {
  let filter: Creed | null = null;
  const visible = (): LordDef[] => LORDS.filter((l) => filter === null || l.creed === filter);
  let index = Math.max(0, visible().findIndex((l) => l.id === (opts.initial ?? '')));

  const card = h('div', { class: 'gallery-card' });
  const overlay = h('div', { class: 'gallery-overlay', role: 'dialog', 'aria-label': opts.title ?? 'Choose your banner' }, card);

  const untrap = trapFocus(overlay);
  const close = (): void => {
    untrap();
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && opts.onCancel) { e.stopPropagation(); close(); opts.onCancel(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };
  document.addEventListener('keydown', onKey, true);

  const step = (dir: number): void => {
    const list = visible();
    index = (index + dir + list.length) % list.length;
    render();
  };

  // swipe: a horizontal drag turns the page
  let touchX: number | null = null;
  overlay.addEventListener('pointerdown', (e) => { touchX = e.clientX; });
  overlay.addEventListener('pointerup', (e) => {
    if (touchX === null) return;
    const dx = e.clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
  });

  const render = (): void => {
    const list = visible();
    if (index >= list.length) index = 0;
    const lord = list[index];
    const creed = CREEDS[lord.creed];
    const isTaken = (opts.taken ?? []).includes(lord.id);

    const bars = PERSONALITY_LABELS.map(([key, label]) =>
      h('div', { class: 'gallery-bar' },
        h('span', { class: 'small muted gallery-bar-label' }, label),
        h('span', { class: 'gallery-bar-track' },
          h('span', { class: 'gallery-bar-ink', style: { width: `${Math.round(lord.personality[key] * 100)}%` } })),
      ));

    mount(card,
      h('div', { class: 'gallery-head' },
        opts.title ? h('p', { class: 'title-over muted italic' }, opts.title) : null,
        h('div', { class: 'gallery-filters' },
          ...([null, 'flame', 'ash', 'umbra'] as (Creed | null)[]).map((c) =>
            h('button', {
              class: `codex-nav-btn ${filter === c ? 'active' : ''}`,
              onclick: () => { filter = c; index = 0; render(); },
            }, c === null ? 'All twelve' : CREEDS[c].name)),
        ),
      ),
      h('div', { class: 'gallery-stage' },
        h('button', { class: 'btn btn-quiet gallery-arrow', 'aria-label': 'Previous lord', onclick: () => step(-1), html: '‹' }),
        h('div', { class: 'gallery-lord' },
          artSlot(`lord-${lord.id}`, sigilShield(lord.id, 72), { className: 'art-portrait-xl', alt: lord.name }),
          h('h2', { class: 'gallery-name' }, lord.name),
          h('p', { class: 'small muted' }, `${lord.epithet} · ${creed.name}`),
          h('p', { class: 'small italic', style: { color: 'var(--gold)' } }, creed.tagline),
          h('p', { class: 'small gallery-blurb' }, lord.blurb),
          h('div', { class: 'gallery-abilities' },
            h('div', { class: 'gallery-ability' },
              h('b', {}, `${lord.perk.label} `, h('span', { class: 'small muted' }, 'legacy')),
              h('p', { class: 'small' }, lord.perk.desc)),
            h('div', { class: 'gallery-ability gallery-signature' },
              h('b', {}, `${lord.signature.name} `, h('span', { class: 'small muted' }, `signature · every ${lord.signature.cooldown + 1} seasons`)),
              h('p', { class: 'small' }, lord.signature.desc)),
          ),
          h('div', { class: 'gallery-bars' }, ...bars),
          h('p', { class: 'small muted' }, `Favors ${TERRAIN[lord.favoredTerrain].name}.`),
          h('p', { class: 'small italic muted gallery-osperan' }, `Osperan: ${OSPERAN_LINES[lord.id] ?? ''}`),
        ),
        h('button', { class: 'btn btn-quiet gallery-arrow', 'aria-label': 'Next lord', onclick: () => step(1), html: '›' }),
      ),
      h('div', { class: 'gallery-actions' },
        h('button', {
          class: 'btn btn-seal',
          disabled: isTaken,
          onclick: () => {
            audio.horn();
            close();
            opts.onPick(lord.id);
          },
        }, isTaken ? 'Already claimed at this table' : 'Take up this banner'),
        opts.onFate
          ? h('button', { class: 'btn', onclick: () => { close(); opts.onFate!(); } }, 'Let fate deal')
          : null,
        opts.onCancel
          ? h('button', { class: 'btn btn-quiet', onclick: () => { close(); opts.onCancel!(); } }, 'Not now')
          : null,
      ),
      h('p', { class: 'small muted', style: { textAlign: 'center', margin: '0.3rem 0 0' } },
        `${index + 1} of ${list.length} — arrows, swipe, or ← → turn the page`),
    );
  };

  render();
  document.body.appendChild(overlay);
}
