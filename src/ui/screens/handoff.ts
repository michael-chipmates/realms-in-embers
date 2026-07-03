/**
 * Hotseat handoff: the table goes dark between mortal turns so no one
 * reads another lord's map. Resolves when the incoming player claims it.
 */
import { LORD_BY_ID } from '../../engine/content/lords';
import { h } from '../dom';
import { exportSave } from '../saves';
import { artSlot } from '../art';
import { sigilShield } from '../heraldry';
import type { GameScreen } from './game';

export function showHandoff(screen: GameScreen): Promise<void> {
  return new Promise((resolve) => {
    const state = screen.state;
    const player = state.players[state.current];
    if (player.kind !== 'human' || !player.alive) {
      resolve();
      return;
    }
    const lord = LORD_BY_ID[player.lordId];
    const overlay = h('div', { class: 'handoff-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pass the table' },
      h('div', { class: 'handoff-center' },
        h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '0.6rem' } },
          artSlot(`lord-${player.lordId}`, sigilShield(player.lordId, 56), { className: 'art-portrait-lg', alt: lord.name })),
        h('p', { class: 'muted italic' }, 'The table is passed. Avert your eyes, the rest of you.'),
        h('h2', { class: 'title-display', style: { fontSize: '1.8rem', margin: '0.6rem 0' } }, `${lord.name}, ${lord.epithet}`),
        h('p', { class: 'muted' }, `Season ${state.turn} awaits your hand.`),
        h('button', {
          class: 'btn btn-seal', style: { marginTop: '1.2rem', fontSize: '1.05rem' },
          onclick: () => {
            overlay.remove();
            resolve();
          },
        }, 'I take the table'),
        h('button', {
          class: 'btn btn-quiet', style: { marginTop: '0.6rem' },
          onclick: () => {
            exportSave(screen.state);
          },
        }, 'Seal & send instead (courier play)'),
        h('p', { class: 'small muted', style: { marginTop: '0.5rem', maxWidth: '44ch' } },
          'Courier play: save the chronicle to a file and send it to the other mortal. They open it from the title screen and the war continues on their table.'),
      ),
    );
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.querySelector('button')?.focus();
    });
  });
}
