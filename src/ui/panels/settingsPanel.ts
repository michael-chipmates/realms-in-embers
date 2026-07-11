/** Settings: accessibility and sound. Available from title and in game. */
import { serializeGame } from '../../engine/engine';
import { RULES_VERSION } from '../../engine/state';
import { h } from '../dom';
import { audio } from '../audio';
import { openModal } from '../modal';
import { seasonName } from '../format';
import { exportSave, getSaveHealth, saveToSlot, subscribeSaveHealth, type SaveHealth } from '../saves';
import type { App } from '../app';

function bugReport(app: App): string {
  const lines = [
    'Realms in Embers — bug report',
    `Rules version: ${RULES_VERSION}`,
    `User agent: ${navigator.userAgent}`,
  ];
  const state = app.game;
  if (state) {
    lines.push(
      '',
      `Seed: ${state.seed}`,
      `Season: ${state.turn}`,
      `Settings: ${JSON.stringify(state.settings)}`,
      '',
      'Save (same format as an exported save, full action log included):',
      serializeGame(state),
    );
  } else {
    lines.push('', 'No game was running.');
  }
  return lines.join('\n');
}

function copyBugReportRow(app: App): HTMLElement {
  const status = h('span', { class: 'small muted', 'aria-live': 'polite' });
  let timer = 0;
  const note = (text: string): void => {
    status.textContent = text;
    clearTimeout(timer);
    timer = window.setTimeout(() => { status.textContent = ''; }, 2500);
  };
  const btn = h('button', {
    class: 'btn compact',
    onclick: () => {
      navigator.clipboard.writeText(bugReport(app)).then(
        () => note('Copied.'),
        () => note('Could not copy — your browser said no.'),
      );
    },
  }, 'Copy bug report');
  return h('div', { class: 'settings-row' },
    h('span', {}, 'Found a bug?',
      h('span', { class: 'small muted', style: { display: 'block' } },
        'Everything a bug hunter needs: seed, settings, and the full action log. Paste it into a GitHub issue.'),
    ),
    h('span', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } }, status, btn),
  );
}

/** Quiet save-health line; grows a warning with Retry/Export when saving fails. */
function saveHealthRow(app: App): { el: HTMLElement; dispose: () => void } {
  const line = h('span', { class: 'small muted', style: { display: 'block' }, 'aria-live': 'polite' });
  const actions = h('span', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } });

  const render = (health: SaveHealth): void => {
    actions.replaceChildren();
    line.style.color = '';
    if (health.state === 'ok') {
      const when = health.lastSavedTurn != null
        ? `Last saved: ${seasonName(health.lastSavedTurn)}.`
        : health.lastSaved != null
          ? `Last saved: ${new Date(health.lastSaved).toLocaleString()}.`
          : 'No save written yet.';
      line.textContent = health.message ? `${when} ${health.message}` : when;
      return;
    }
    line.textContent = health.message ?? 'The realm could not be saved.';
    line.style.color = 'var(--danger)';
    if (app.game && health.state === 'failed') {
      actions.append(h('button', {
        class: 'btn compact',
        onclick: () => { if (app.game) saveToSlot(app.game, 'auto'); },
      }, 'Retry'));
    }
    if (app.game) {
      actions.append(h('button', {
        class: 'btn compact',
        onclick: () => { if (app.game) exportSave(app.game); },
      }, 'Export'));
    }
  };

  const dispose = subscribeSaveHealth(render);
  render(getSaveHealth());
  const el = h('div', { class: 'settings-row' },
    h('span', {}, 'Chronicle keeping', line),
    actions,
  );
  return { el, dispose };
}

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
  const healthRow = saveHealthRow(app);
  const content = h('div', { class: 'settings-body' },
    h('h3', { class: 'settings-head' }, 'Seeing'),
    toggle('Colorblind patterns', s.colorblind, (v) => {
      s.colorblind = v;
      app.applySettings();
      app.gameScreen?.redrawMap();
    }, 'Overlays each lord’s lands with a distinct pattern, beyond color.'),
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
    h('h3', { class: 'settings-head' }, 'Keeping'),
    healthRow.el,
    h('h3', { class: 'settings-head' }, 'Credits'),
    h('div', { class: 'small muted', style: { lineHeight: '1.5' } },
      ...audio.credits().map((line) => h('p', { style: { margin: '0 0 0.3rem' } }, line)),
      h('p', { style: { margin: '0' } }, 'Everything else — code, world, words, icons — made for this game.'),
    ),
    h('h3', { class: 'settings-head' }, 'Reading'),
    toggle('Veteran chronicle', s.veteranChronicle, (v) => {
      s.veteranChronicle = v;
      app.applySettings();
      if (app.game) app.game.settings.veteranChronicle = v;
    }, "Osperan skips his teaching asides. For those who have read the Chronicle before."),
    h('h3', { class: 'settings-head' }, 'Reporting'),
    copyBugReportRow(app),
  );
  openModal('Settings', content, { onClose: healthRow.dispose });
}
