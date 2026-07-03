/** The title screen: a dark room, a warm table, and the ways in. */
import { h, mount } from '../dom';
import { artSlot } from '../art';
import { iconSvg } from '../icons';
import { hasAnySave, listSlots, loadSlot, newestSave, deleteSlot, importSave } from '../saves';
import { openModal } from '../modal';
import { openSettingsPanel } from '../panels/settingsPanel';
import type { App } from '../app';

export function renderTitle(app: App): void {
  const canContinue = hasAnySave();

  const menu = h(
    'div',
    { class: 'title-menu' },
    h('button', { class: 'btn btn-seal title-btn', onclick: () => app.toSetup() }, 'New Chronicle'),
    canContinue
      ? h('button', {
          class: 'btn title-btn',
          onclick: () => {
            const newest = newestSave();
            if (newest) {
              const state = loadSlot(newest.key);
              if (state) app.continueGame(state);
            }
          },
        }, 'Continue')
      : null,
    h('button', {
      class: 'btn title-btn',
      onclick: () => {
        const d = new Date();
        const seed = `embermark-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        app.toSetup(seed);
      },
    }, 'Seed of the Day'),
    h('button', { class: 'btn title-btn', onclick: () => openLoadModal(app) }, 'Load a Chronicle'),
    h('button', { class: 'btn title-btn', onclick: () => openSettingsPanel(app) }, 'Settings'),
  );

  const screen = h(
    'div',
    { class: 'room title-screen' },
    artSlot('title-hall', h('span'), { className: 'title-backdrop', alt: '' }),
    h('div', { class: 'title-center' },
      h('p', { class: 'title-over muted italic' }, 'Forty years after the Sundering'),
      h('h1', { class: 'title-display title-main' }, 'Realms in Embers'),
      h('div', { class: 'rule-flourish', style: { width: 'min(420px, 70vw)', margin: '0.6rem auto 0.2rem' } }, '❧'),
      h('p', { class: 'muted italic title-sub' },
        'The throne is cold. The chronicler is not quite dead. The war for the ashes begins with you.'),
      menu,
      h('p', { class: 'small muted title-foot' },
        'A turn-based strategy chronicle · an original homage to the spirit of 1993'),
    ),
  );
  mount(app.root, screen);
}

export function openLoadModal(app: App): void {
  const slots = listSlots();
  const list = h('div', { class: 'slot-list' });

  const refresh = (): void => {
    mount(list,
      ...(listSlots().length === 0
        ? [h('p', { class: 'muted italic', style: { padding: '1rem' } }, 'No chronicles on the shelf yet.')]
        : listSlots().map((slot) =>
            h('div', { class: 'slot-row' },
              h('div', { class: 'slot-info' },
                h('div', {}, `${slot.label} — season ${slot.turn}`),
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
                  onclick: () => {
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
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const state = await importSave(file);
        modal.close();
        app.continueGame(state);
      } catch {
        alertLine.textContent = 'That file is not a readable chronicle.';
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
  void slots;
  refresh();
}
