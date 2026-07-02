/** Settings: accessibility and sound. Available from title and in game. */
import { h } from '../dom';
import { openModal } from '../modal';
import type { App } from '../app';

function slider(label: string, value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLElement {
  const input = h('input', {
    type: 'range', class: 'slider', min: String(min), max: String(max), step: String(step), value: String(value),
    oninput: (e: Event) => onInput(parseFloat((e.target as HTMLInputElement).value)),
    'aria-label': label,
  });
  return h('label', { class: 'settings-row' }, h('span', {}, label), input);
}

function toggle(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    ...(checked ? { checked: true } : {}),
    onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
  });
  return h('label', { class: 'settings-row' },
    h('span', {}, label, hint ? h('span', { class: 'small muted', style: { display: 'block' } }, hint) : null),
    input,
  );
}

export function openSettingsPanel(app: App): void {
  const s = app.settings;
  const content = h('div', { class: 'settings-body' },
    h('h3', { class: 'settings-head' }, 'Seeing'),
    toggle('Colorblind patterns', s.colorblind, (v) => {
      s.colorblind = v;
      app.applySettings();
      app.gameScreen?.redrawMap();
    }, 'Overlays each realm with its own pattern, beyond color.'),
    toggle('Reduced motion', s.reducedMotion, (v) => {
      s.reducedMotion = v;
      app.applySettings();
    }, 'Stills the candlelight and all nonessential animation.'),
    slider('Text size', s.textScale, 0.9, 1.35, 0.05, (v) => {
      s.textScale = v;
      app.applySettings();
    }),
    h('h3', { class: 'settings-head' }, 'Hearing'),
    slider('Master volume', s.volMaster, 0, 1, 0.05, (v) => {
      s.volMaster = v;
      app.applySettings();
    }),
    slider('Music', s.volMusic, 0, 1, 0.05, (v) => {
      s.volMusic = v;
      app.applySettings();
    }),
    slider('Effects', s.volSfx, 0, 1, 0.05, (v) => {
      s.volSfx = v;
      app.applySettings();
    }),
    h('h3', { class: 'settings-head' }, 'Reading'),
    toggle('Veteran chronicle', s.veteranChronicle, (v) => {
      s.veteranChronicle = v;
      app.applySettings();
      if (app.game) app.game.settings.veteranChronicle = v;
    }, "Osperan skips his teaching asides. For those who have read the Chronicle before."),
  );
  openModal('Settings', content);
}
