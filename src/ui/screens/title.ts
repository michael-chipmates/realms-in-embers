/** The title screen: a dark room, a warm table, and the ways in.
 * It should feel inhabited: the chronicler is still writing when you
 * walk in. Motion here is UI-only (never the game rng) and every effect
 * respects reduced-motion. */
import { h, mount } from '../dom';
import { artSlot } from '../art';
import { iconSvg } from '../icons';
import { hasAnySave, listSlots, loadSlot, newestSave, deleteSlot, importSave } from '../saves';
import { openOnlineLobby } from './lobby';
import { openModal } from '../modal';
import { openSettingsPanel } from '../panels/settingsPanel';
import { openLordGallery } from './gallery';
import { FIRST_EMBER_DONE_KEY, FIRST_EMBER_SEED, FirstEmberGuide } from '../guide';
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
  const line = h('p', { class: 'small muted title-ios-hint' },
    'Keep the realm on your shelf: Share ',
    h('span', { 'aria-hidden': 'true' }, '⎋'),
    ' → “Add to Home Screen”. It works with no wire after that. ',
    h('button', {
      class: 'btn btn-quiet compact',
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

export function renderTitle(app: App): void {
  const canContinue = hasAnySave();
  const newest = canContinue ? newestSave() : null;
  const epigraph = EPIGRAPHS[Math.floor(Math.random() * EPIGRAPHS.length)];
  // a stranger's first visit leads with the guided door; veterans keep theirs
  const firstVisit = !canContinue && localStorage.getItem(FIRST_EMBER_DONE_KEY) === null;

  // Three doors, not seven (redesign 1a/2a). The wax plaque leads with the
  // guided game for a stranger; once the First Ember has been played (or a
  // chronicle sits on the shelf), New Chronicle takes the plaque and the
  // ember shrinks to ink (Michel, 2026-07-13). A running campaign rides
  // beside it as a brass door; every other way in is demoted to ink.
  const waxPlaque = (title: string, sub: string, onclick: (e: Event) => void): HTMLElement =>
    h('button', { class: 'door-plaque', onclick },
      h('span', { class: 'door-wax', 'aria-hidden': 'true' },
        h('span', { class: 'door-wax-ring' }, h('span', { class: 'door-wax-diamond' }))),
      h('span', { class: 'door-plaque-text' },
        h('span', { class: 'door-plaque-title' }, title),
        h('span', { class: 'door-plaque-sub' }, sub),
      ),
    );

  const plaque = firstVisit
    ? waxPlaque('The First Ember', 'your first war, guided by the ghost · skippable', () => startFirstEmber(app))
    : waxPlaque('New Chronicle', 'a realm of your choosing, set up your way', () => app.toSetup());

  const continueBtn = newest
    ? h('button', {
        class: 'btn title-btn',
        onclick: (e: Event) => {
          const state = loadSlot(newest.key);
          if (state) { app.continueGame(state); return; }
          // a dead button teaches nothing: say what happened (round-2 audit)
          (e.currentTarget as HTMLButtonElement).textContent =
            'That save could not be read. Try Load a Chronicle below.';
        },
      }, `Continue · ${newest.lords.split(',')[0]?.trim() ?? 'the war'}, season ${newest.turn}`)
    : null;

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

  const dot = (): HTMLElement => h('span', { class: 'title-link-dot', 'aria-hidden': 'true' }, '·');
  const links: HTMLElement[] = [];
  const addLink = (label: string, onclick: () => void): void => {
    if (links.length > 0) links.push(dot());
    links.push(h('button', { class: 'btn-link', onclick }, label));
  };
  if (!firstVisit) addLink('The First Ember', () => startFirstEmber(app));
  addLink('A Quick Chronicle', () => openQuickWar(app));
  addLink('The Week’s Seed', weekSeed);
  addLink('Load a Chronicle', () => openLoadModal(app));
  addLink('Settings', () => openSettingsPanel(app));

  const menu = h(
    'div',
    { class: 'title-menu title-doors' },
    plaque,
    h('div', { class: 'title-brass-row' },
      firstVisit ? h('button', { class: 'btn title-btn', onclick: () => app.toSetup() }, 'New Chronicle') : null,
      continueBtn,
      h('button', { class: 'btn title-btn', onclick: () => void openOnlineLobby(app) }, 'Play with Friends'),
    ),
    h('div', { class: 'title-links' }, ...links),
  );

  const screen = h(
    'div',
    { class: 'room title-screen' },
    artSlot('title-hall', h('span'), { className: 'title-backdrop', alt: '', eager: true }),
    h('main', { class: 'title-center' },
      h('p', { class: 'title-over muted italic' }, 'Forty years after the Sundering'),
      h('h1', { class: 'title-display title-main' }, 'Realms in Embers'),
      h('div', { class: 'rule-flourish', style: { width: 'min(420px, 70vw)', margin: '0.6rem auto 0.2rem' } }, '❧'),
      h('p', { class: 'muted italic title-sub' },
        'The throne is cold. The chronicler is not quite dead. The war for the ashes begins with you.'),
      menu,
      h('p', { class: 'small muted italic title-epigraph' }, `“${epigraph}” (O.)`),
      h('p', { class: 'small muted title-foot' },
        'A turn-based strategy chronicle · an original homage to the spirit of 1993'),
      // iOS keeps its install button three taps deep; one quiet line, once
      iosInstallHint(),
    ),
  );
  mount(app.root, screen);
  // staged update: a waiting edition is offered here, in the quiet room:
  // it never seizes a live campaign (BOOT_OK handshake in swUpdate.ts)
  const offerUpdate = (): void => {
    if (!screen.isConnected || screen.querySelector('.title-update')) return;
    screen.querySelector('.title-menu')?.appendChild(
      h('button', { class: 'btn btn-quiet title-btn title-update', onclick: () => applyUpdate() },
        'A fresh edition is ready. Take the table now'));
  };
  if (updateWaiting()) offerUpdate();
  else onUpdateReady(offerUpdate);
  if (!app.settings.reducedMotion) startEmberDrift(screen);
}

/** A quiet column of embers rising through the dark. UI-only randomness;
 * stops itself the moment the title screen leaves the DOM. */
function startEmberDrift(screen: HTMLElement): void {
  const canvas = h('canvas', { class: 'title-embers', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  screen.insertBefore(canvas, screen.children[1] ?? null);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  interface Ember { x: number; y: number; r: number; vy: number; vx: number; warm: number; phase: number }
  const embers: Ember[] = [];
  const spawn = (y?: number): Ember => ({
    x: Math.random(),
    y: y ?? 1 + Math.random() * 0.1,
    r: 0.8 + Math.random() * 1.8,
    vy: 0.0006 + Math.random() * 0.0012,
    vx: (Math.random() - 0.5) * 0.0003,
    warm: 0.55 + Math.random() * 0.45,
    phase: Math.random() * Math.PI * 2,
  });
  for (let i = 0; i < 26; i++) embers.push(spawn(Math.random()));
  let t = 0;
  const frame = (): void => {
    if (!canvas.isConnected) return; // title gone; stop drawing
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; }
    ctx.clearRect(0, 0, w, hgt);
    t += 1;
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.y -= e.vy;
      e.x += e.vx + Math.sin(t / 90 + e.phase) * 0.00012;
      if (e.y < -0.05) embers[i] = spawn();
      const flicker = 0.75 + 0.25 * Math.sin(t / 14 + e.phase);
      ctx.beginPath();
      ctx.arc(e.x * w, e.y * hgt, e.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${232 - e.warm * 40}, ${130 + e.warm * 30}, 44, ${0.10 + 0.25 * e.warm * flicker})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
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
