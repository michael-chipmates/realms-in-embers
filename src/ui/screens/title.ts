/** The title screen: "The Marginalia" (redesign 2a).
 *
 * The painting is unveiled, full-bleed, no scrim to black. The whole menu
 * lives on a vellum ledger pinned to the right edge: Continue is a portrait
 * card sealed in wax, everything else a numbered table of contents. The
 * composition is deliberately asymmetric and save-aware. Motion here is
 * UI-only (never the game rng) and stands down under reduced-motion. */
import { h, mount } from '../dom';
import { artSlot } from '../art';
import { iconSvg } from '../icons';
import { sigilShield } from '../heraldry';
import { hasAnySave, listSlots, loadSlot, newestSave, deleteSlot, importSave } from '../saves';
import { openOnlineLobby } from './lobby';
import { openModal } from '../modal';
import { openSettingsPanel } from '../panels/settingsPanel';
import { openLordGallery } from './gallery';
import { FIRST_EMBER_SEED, FirstEmberGuide } from '../guide';
import { applyUpdate, onUpdateReady, updateWaiting } from '../swUpdate';
import type { Difficulty } from '../../engine/types';
import type { App } from '../app';

/** A Quick Chronicle: one tap, one choice, straight into the fire. A random
 * medium realm, you against three rivals, fog on, 36 seasons: the full game
 * with none of the muster table. Renamed from "Quick War" (2026-07-12):
 * the fastest door in the house should not greet a newcomer with a fist.
 * The gentle option exists so a first evening ends in a story, not a siege
 * of the tutorial. */
const QUICK_WARS: { label: string; blurb: string; difficulty: Difficulty }[] = [
  {
    label: 'Gentle',
    blurb: 'Rivals who make mistakes and forgive yours. For a first war.',
    difficulty: 'squire',
  },
  {
    label: 'Standard',
    blurb: 'Rivals who play their tempers honestly. The intended game.',
    difficulty: 'knight',
  },
  {
    label: 'Merciless',
    blurb: 'Rivals with sharpened knives and long memories. You were warned.',
    difficulty: 'warlord',
  },
];

function openQuickWar(app: App): void {
  const begin = (difficulty: Difficulty, lordId: string): void => {
    app.startGame({
      seed: `quickwar-${Math.random().toString(36).slice(2, 10)}`,
      mapSize: 'medium',
      players: [
        { kind: 'human', lordId, difficulty },
        { kind: 'ai', lordId: 'random', difficulty },
        { kind: 'ai', lordId: 'random', difficulty },
        { kind: 'ai', lordId: 'random', difficulty },
      ],
      victoryPaths: ['conquest', 'dominion', 'goldenAge', 'legend'],
      maxTurns: 36,
      fogOfWar: true,
      veteranChronicle: false,
    });
  };
  const modal = openModal('A Quick Chronicle', h('div', { class: 'quickwar-body' },
    h('p', { class: 'small muted', style: { margin: '0 0 0.7rem' } },
      'A fresh realm, you and three rivals, 36 seasons, the map unexplored. Pick how hard they fight, then pick your banner.'),
    ...QUICK_WARS.map((q) =>
      h('button', {
        class: 'btn quickwar-option',
        onclick: () => {
          modal.close();
          openLordGallery({
            title: `A ${q.label.toLowerCase()} war. Whose banner do you carry?`,
            onPick: (lordId) => begin(q.difficulty, lordId),
            onFate: () => begin(q.difficulty, 'random'),
            onCancel: () => openQuickWar(app),
          });
        },
      },
        h('span', { class: 'quickwar-label' }, q.label),
        h('span', { class: 'small muted' }, q.blurb),
      )),
  ));
}

/** The First Ember: a real chronicle on a fixed, friendly seed, with a
 * quiet guide that steps forward only when the real thing has happened.
 * The seed is pinned so the opening always teaches: works to raise,
 * companies to muster, a march within reach. Fog is ON deliberately
 * (Michel, 2026-07-12): a newcomer's first page is their seat and its
 * neighbors, not twelve banners at once. */
function startFirstEmber(app: App): void {
  app.startGame({
    seed: FIRST_EMBER_SEED,
    mapSize: 'small',
    players: [
      { kind: 'human', lordId: 'random', difficulty: 'squire' },
      { kind: 'ai', lordId: 'random', difficulty: 'squire' },
      { kind: 'ai', lordId: 'random', difficulty: 'squire' },
    ],
    victoryPaths: ['conquest', 'dominion', 'goldenAge', 'legend'],
    maxTurns: 36,
    fogOfWar: true,
    veteranChronicle: false,
  }, { guide: new FirstEmberGuide() });
}

/** On iOS Safari, outside standalone mode, once per device: the one line
 * that turns a tab into a game on the shelf. Dismissable for good. */
function iosInstallHint(): HTMLElement | null {
  const HINT_KEY = 'rie-ios-hint-done';
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!isIos || standalone || localStorage.getItem(HINT_KEY) !== null) return null;
  const line = h('p', { class: 'small title-ios-hint' },
    'Keep the realm on your shelf: Share ',
    h('span', { 'aria-hidden': 'true' }, '⎋'),
    ' → “Add to Home Screen”. It works with no wire after that. ',
    h('button', {
      class: 'tm-util',
      onclick: () => {
        localStorage.setItem(HINT_KEY, '1');
        line.remove();
      },
    }, 'Noted'),
  );
  return line;
}

/** Osperan keeps writing between wars. A different line each visit. */
const EPIGRAPHS = [
  'Somebody has to bury them properly.',
  'The margin for the dead is ruled wide. It has never once been wide enough.',
  'Forty years, and the ink still smells of smoke.',
  'Every claimant believes the fire will know them. The fire has never once asked a name.',
  'I have outlived the realm, the throne, and myself. The paperwork continues.',
  'Wars end at one of two harvests. Hope for the wheat.',
  'The candle leans toward the door when you enter. It remembers doors.',
  'History is what survives its witnesses. Sit down; you are about to be survived.',
];

/** When the chronicle was last set down, in Osperan's plain words. Same
 * calendar day reads by its part; then yesterday, then a few days, then a
 * short date. Never a clock: a shelf keeps seasons, not minutes. */
function relativeSaved(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 90_000) return 'just now';
  const then = new Date(ts);
  const today = new Date(now);
  if (then.toDateString() === today.toDateString()) {
    const hr = then.getHours();
    if (hr < 12) return 'this morning';
    if (hr < 18) return 'this afternoon';
    return 'this evening';
  }
  const yst = new Date(now);
  yst.setDate(yst.getDate() - 1);
  if (then.toDateString() === yst.toDateString()) return 'yesterday';
  const days = Math.round(diff / 86_400_000);
  if (days <= 6) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The sidebar slides in once per session, not on every return to the room. */
let ledgerHasEntered = false;

export function renderTitle(app: App): void {
  const newest = hasAnySave() ? newestSave() : null;
  const footerQuote = EPIGRAPHS[Math.floor(Math.random() * EPIGRAPHS.length)];

  // ------------------------------------------------------- the art zone
  // The painting, unveiled. Scrims live in CSS (they must not dim to black);
  // the title lockup sits over its bottom-left, anchored by the radial scrim.
  const artZone = h('header', { class: 'tm-art' },
    artSlot('title-hall', h('span', { class: 'tm-art-fallback', 'aria-hidden': 'true' }),
      { className: 'tm-art-img', alt: '', eager: true }),
    h('div', { class: 'tm-scrim', 'aria-hidden': 'true' }),
    h('div', { class: 'tm-lockup' },
      h('p', { class: 'tm-kicker' }, 'Forty years after the Sundering'),
      h('h1', { class: 'tm-title title-display' }, 'Realms', h('br'), 'in Embers'),
      h('div', { class: 'tm-rule', 'aria-hidden': 'true' }, h('span', { class: 'ember-diamond tm-rule-diamond' })),
      h('p', { class: 'tm-epigraph fell' },
        'The throne is cold. The chronicler is not quite dead. The war for the ashes begins with you.'),
    ),
  );

  // ------------------------------------------------- the Continue card
  // Only when a chronicle sits on the shelf. Portrait of the lord you play,
  // name in the chronicle's own hand, season and when it was set down. One
  // link/button; an explicit label keeps its accessible name honest.
  const portrait = (lordId: string): HTMLElement =>
    lordId
      ? artSlot(`lord-${lordId}`, sigilShield(lordId, 44), { className: 'tm-portrait-img', alt: newest?.lordName ?? '' })
      : h('span', { class: 'tm-portrait-mark', 'aria-hidden': 'true' }, h('span', { class: 'ember-diamond' }));

  const continueCard = newest
    ? h('button', {
        class: 'tm-continue',
        'aria-label': `Continue the chronicle of ${newest.lordName || 'your realm'}, season ${newest.turn}, saved ${relativeSaved(newest.savedAt)}`,
        onclick: (e: Event) => {
          const state = loadSlot(newest.key);
          if (state) { app.continueGame(state); return; }
          // a dead button teaches nothing: say what happened (round-2 audit)
          (e.currentTarget as HTMLButtonElement).textContent =
            'That save could not be read. Try Load below.';
        },
      },
        h('span', { class: 'tm-portrait' }, portrait(newest.lordId)),
        h('span', { class: 'tm-continue-text' },
          h('span', { class: 'tm-continue-kick' }, 'Continue'),
          h('span', { class: 'tm-continue-name' }, newest.lordName || 'the war'),
          h('span', { class: 'tm-continue-meta' },
            `Season ${newest.turn} · `,
            h('span', { class: 'tm-saved' }, 'saved '),
            relativeSaved(newest.savedAt)),
        ),
        h('span', { class: 'tm-seal', 'aria-hidden': 'true' }, h('span', { class: 'tm-seal-diamond ember-diamond' })),
      )
    : null;

  // ------------------------------------------------- the table of contents
  const toc: { num: string; label: string; note: string; promoteNote?: string; onClick: () => void }[] = [
    { num: 'I.', label: 'A Quick Chronicle', note: 'one evening', onClick: () => openQuickWar(app) },
    { num: 'II.', label: 'New Chronicle', note: 'choose your lord', onClick: () => app.toSetup() },
    { num: 'III.', label: 'Play with Friends', note: 'six seats, one link', onClick: () => void openOnlineLobby(app) },
    { num: 'IV.', label: 'The First Ember', note: 'your first war, guided', promoteNote: 'start here', onClick: () => startFirstEmber(app) },
  ];
  const tocRow = (r: (typeof toc)[number]): HTMLElement => {
    // no save on the shelf: the guided door is promoted (its note becomes
    // "start here" and its ember marker stands lit, not just on hover).
    const promoted = !newest && !!r.promoteNote;
    return h('button', { class: `tm-toc-row${promoted ? ' tm-toc-promoted' : ''}`, onclick: r.onClick },
      h('span', { class: 'tm-toc-mark ember-diamond', 'aria-hidden': 'true' }),
      h('span', { class: 'tm-toc-num', 'aria-hidden': 'true' }, r.num),
      h('span', { class: 'tm-toc-label' }, r.label),
      h('span', { class: 'tm-toc-note' }, promoted ? r.promoteNote! : r.note),
    );
  };

  const weekSeed = (): void => {
    // The Week's Seed: one realm the whole table shares for seven days.
    // ISO week from UTC, so every player worldwide forges the same land
    // (weekly, not daily: a campaign is an evening, not a Wordle).
    const d = new Date();
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    app.toSetup(`embermark-${utc.getUTCFullYear()}-w${String(week).padStart(2, '0')}`);
  };

  const utilDot = (): HTMLElement => h('span', { class: 'tm-util-dot', 'aria-hidden': 'true' });
  const utility = h('div', { class: 'tm-utility' },
    h('button', { class: 'tm-util', onclick: weekSeed }, 'The Week’s Seed'),
    utilDot(),
    h('button', { class: 'tm-util', onclick: () => openLoadModal(app) }, 'Load'),
    utilDot(),
    h('button', { class: 'tm-util', onclick: () => openSettingsPanel(app) }, 'Settings'),
  );

  // ------------------------------------------------------------ the ledger
  const nav = h('nav', { 'aria-label': 'Main menu', class: 'tm-nav' },
    h('div', { class: 'tm-header' },
      h('img', { class: 'tm-mark', src: 'favicon.svg', alt: '', 'aria-hidden': 'true', width: '20', height: '20' }),
      h('span', { class: 'tm-header-label' }, 'The Chronicle'),
      h('span', { class: 'tm-header-hair', 'aria-hidden': 'true' }),
    ),
    continueCard,
    h('div', { class: 'tm-toc' }, ...toc.map(tocRow)),
    utility,
    // iOS keeps its install button three taps deep; one quiet line, once
    iosInstallHint(),
  );

  const ledgerFirstLoad = !ledgerHasEntered && !app.settings.reducedMotion;
  // the ledger is the screen's primary content (the ways in): a <main>
  // landmark, with the menu as its <nav>. The art is the <header> banner.
  const ledger = h('main', { class: `tm-ledger${ledgerFirstLoad ? ' tm-first-load' : ''}` },
    nav,
    h('footer', { class: 'tm-foot' },
      h('p', { class: 'tm-foot-quote fell' }, `“${footerQuote}” (O.)`),
      h('p', { class: 'tm-foot-sub' },
        'A turn-based strategy chronicle · an original homage to the spirit of 1993'),
    ),
  );
  ledgerHasEntered = true;

  const screen = h('div', { class: 'title-screen title-marginalia' }, artZone, ledger);
  mount(app.root, screen);

  // staged update: a waiting edition is offered here, in the quiet room:
  // it never seizes a live campaign (BOOT_OK handshake in swUpdate.ts)
  const offerUpdate = (): void => {
    if (!screen.isConnected || screen.querySelector('.tm-update')) return;
    nav.appendChild(
      h('button', { class: 'tm-update', onclick: () => applyUpdate() },
        'A fresh edition is ready. Take the table now'));
  };
  if (updateWaiting()) offerUpdate();
  else onUpdateReady(offerUpdate);
}

export function openLoadModal(app: App): void {
  const list = h('div', { class: 'slot-list' });

  const refresh = (): void => {
    mount(list,
      ...(listSlots().length === 0
        ? [h('p', { class: 'muted italic', style: { padding: '1rem' } }, 'No chronicles on the shelf yet.')]
        : listSlots().map((slot) =>
            h('div', { class: 'slot-row' },
              h('div', { class: 'slot-info' },
                h('div', {}, `${slot.label} · season ${slot.turn}`),
                h('div', { class: 'small muted' }, `${slot.lords}`),
                h('div', { class: 'small muted' }, `seed “${slot.seed}” · ${new Date(slot.savedAt).toLocaleString()}`),
              ),
              h('div', { class: 'slot-actions' },
                h('button', {
                  class: 'btn',
                  onclick: () => {
                    const state = loadSlot(slot.key);
                    if (state) {
                      modal.close();
                      app.continueGame(state);
                    }
                  },
                }, 'Open'),
                h('button', {
                  class: 'btn btn-quiet',
                  'aria-label': `Delete ${slot.label}`,
                  onclick: (e: Event) => {
                    // two clicks to burn a chronicle: one is an accident
                    const btn = e.currentTarget as HTMLButtonElement;
                    if (btn.dataset.armed !== '1') {
                      btn.dataset.armed = '1';
                      btn.textContent = 'Burn. Sure?';
                      window.setTimeout(() => {
                        if (btn.isConnected) {
                          btn.dataset.armed = '';
                          btn.textContent = 'Burn';
                        }
                      }, 3000);
                      return;
                    }
                    deleteSlot(slot.key);
                    refresh();
                  },
                }, 'Burn'),
              ),
            ),
          )),
    );
  };

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    style: { display: 'none' },
    onchange: async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = ''; // re-choosing the same file must fire change again
      if (!file) return;
      try {
        const state = await importSave(file);
        modal.close();
        app.continueGame(state);
      } catch {
        alertLine.textContent = 'That file is not a readable chronicle. Choose a .json exported from this game.';
      }
    },
  }) as HTMLInputElement;

  const alertLine = h('p', { class: 'small', style: { color: 'var(--danger)', minHeight: '1.2em', margin: '0.3rem 0 0' } });

  const content = h('div', { style: { padding: '0.8rem', minWidth: 'min(540px, 86vw)' } },
    list,
    h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.8rem', alignItems: 'center' } },
      h('button', { class: 'btn', onclick: () => fileInput.click(), html: `${iconSvg('save', 16)} Import from file` }),
      alertLine,
    ),
    fileInput,
  );
  const modal = openModal('The Shelf of Chronicles', content, { wide: true });
  refresh();
}
