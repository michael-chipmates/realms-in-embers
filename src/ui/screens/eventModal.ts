/** The realm answers back: event choices, previewed truthfully, undismissable. */
import { eventText } from '../../engine/events';
import { h } from '../dom';
import { openModal } from '../modal';
import type { GameScreen } from './game';

let eventModalOpen = false;

export function maybeOpenEventModal(screen: GameScreen): void {
  if (eventModalOpen) return;
  const state = screen.state;
  if (state.phase !== 'playing') return;
  const current = screen.current();
  if (current.kind !== 'human') return;
  const pending = state.pendingEvents.find((e) => e.player === current.id);
  if (!pending) return;
  const info = eventText(state, pending.id);
  if (!info) return;

  eventModalOpen = true;
  const content = h('div', { class: 'event-body' },
    h('p', { class: 'event-text' }, info.text),
    h('div', { class: 'event-choices' },
      ...info.choices.map((choice, idx) =>
        h('button', {
          class: 'event-choice',
          onclick: () => {
            modal.close();
            eventModalOpen = false;
            screen.dispatch({ t: 'eventChoice', eventId: pending.id, choiceIdx: idx });
            // chain to the next event if one is queued
            maybeOpenEventModal(screen);
          },
        },
          h('span', { class: 'event-choice-label' }, choice.label),
          h('span', { class: 'event-choice-preview small muted' }, choice.preview),
        ),
      ),
    ),
  );
  const modal = openModal(info.title, content, {
    dismissable: false,
    wide: true,
    onClose: () => {
      eventModalOpen = false;
    },
  });
}
