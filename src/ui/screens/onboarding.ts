/**
 * The opening of the chronicle: Osperan orients a new claimant in four
 * short pages. In fiction, skippable, and never seen again after turn one.
 */
import { LORD_BY_ID } from '../../engine/content/lords';
import { CREEDS } from '../../engine/content/world';
import { h } from '../dom';
import { iconSvg } from '../icons';
import { artSlot } from '../art';
import { audio } from '../audio';
import { trapFocus } from '../modal';
import type { GameScreen } from './game';

interface Page {
  icon: string;
  title: string;
  body: string;
}

export function maybeShowOnboarding(screen: GameScreen): void {
  const state = screen.state;
  if (state.turn !== 1) return;
  if (state.log.some((l) => l.action.t !== 'endTurn')) return;
  if (state.settings.veteranChronicle) return;
  // online: Osperan addresses YOU, not seat 0 — spectators and mid-war
  // rejoiners (their relay cursor is already past the opening) get no speech
  if (screen.online) {
    if (screen.online.mySeat < 0) return;
    if (screen.online.cursor < screen.online.client.entries.length) return;
  }
  const player = screen.online ? state.players[screen.online.mySeat] : screen.current();
  if (!player || player.kind !== 'human') return;
  const lord = LORD_BY_ID[player.lordId];
  const seat = state.provinces[player.seatProvince];
  const creed = CREEDS[lord.creed];

  const pages: Page[] = [
    {
      icon: 'quill',
      title: 'A cold hand opens the book',
      body: `So. ${lord.name}, ${lord.epithet}, sworn to ${creed.name}. I am Osperan — I chronicled this realm for the old kings, and dying in the Sundering has not excused me from finishing the work. Your seat is ${seat.name}; the banner on the map marks it. Everything you rule glows with your color. Everything else is either free, or somebody's, or worse.`,
    },
    {
      icon: 'gold',
      title: 'The realm runs on three things',
      body: `Gold and Emberlight sit in the bar above; order lives on every province you select — all of it inspectable. Rest your eyes (or your finger) on ANY number in my margins and I will itemize exactly where it comes from and where it goes. If a number in this realm cannot explain itself, I have failed, and I do not intend to fail twice in one age.`,
    },
    {
      icon: 'swords',
      title: 'Marching and the arithmetic of blood',
      body: `Choose a province, then its army, and the map will glow where it can march. Marching into a foe shows you the full odds first — every advantage, both sides, in plain words — and only then asks for blood. Free provinces have militias and opinions; your rivals have armies and memories. They remember gifts. They remember betrayals considerably longer.`,
    },
    {
      icon: 'crownSmall',
      title: 'How this ends',
      body: `Ways to the throne: conquest, dominion, a golden age of coin and quiet, or the Grand Saga — five chapters that end with a hero of yours relighting the Ember Throne itself (the Quests screen keeps the count). The Ledger screen tracks every race, and when any rule wants studying, the Codex (the tome in the bar, or the letter c) holds my complete handbook of this realm. And the Chronicle ALWAYS ends — season ${state.victory.maxTurns} at the latest, when I judge the realm as it stands. End your season with the wax-red button. I shall be watching. It is, quite literally, all I can do.`,
    },
  ];

  let idx = 0;
  const iconWrap = h('div', { class: 'ceremony-icon' });
  const titleEl = h('h2', { class: 'title-display', style: { fontSize: '1.5rem' } });
  const bodyEl = h('p', { class: 'ceremony-text', style: { minHeight: '9em' } });
  const progress = h('div', { class: 'small muted', style: { margin: '0.6rem 0' } });
  const nextBtn = h('button', { class: 'btn btn-seal', style: { minWidth: '160px' } }) as HTMLButtonElement;

  const render = (): void => {
    const page = pages[idx];
    iconWrap.innerHTML = iconSvg(page.icon, 40);
    titleEl.textContent = page.title;
    bodyEl.textContent = page.body;
    progress.textContent = `${idx + 1} of ${pages.length}`;
    nextBtn.textContent = idx < pages.length - 1 ? 'Go on' : 'Take the realm';
  };

  const overlay = h('div', { class: 'ceremony-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'The opening of the chronicle' },
    h('div', { class: 'ceremony-center' },
      artSlot('osperan', h('span'), { className: 'art-osperan-hero', alt: 'Osperan the Unresting' }),
      iconWrap,
      titleEl,
      h('div', { class: 'rule-flourish', style: { width: 'min(340px, 55vw)', margin: '0.7rem auto' } }, '❧'),
      bodyEl,
      progress,
      h('div', { style: { display: 'flex', gap: '0.7rem', justifyContent: 'center', marginTop: '0.4rem' } },
        nextBtn,
        h('button', {
          class: 'btn btn-quiet',
          onclick: () => { untrap(); overlay.remove(); },
        }, 'I have read the Chronicle before'),
      ),
    ),
  );
  let spoke = false;
  nextBtn.addEventListener('click', () => {
    if (!spoke) {
      spoke = true;
      audio.unlock();
      audio.voice('opening'); // the first click is the gesture that frees his voice
    }
    if (idx < pages.length - 1) {
      idx++;
      render();
    } else {
      untrap();
      overlay.remove();
    }
  });
  render();
  document.body.appendChild(overlay);
  const untrap = trapFocus(overlay);
}
