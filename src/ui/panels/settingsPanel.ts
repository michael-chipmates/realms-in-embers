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
    'Realms in Embers: bug report',
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

/** The offline keeper's card: whether it stands watch, how much it holds,
 * and one button that fetches the whole realm (art, score, voice) so a
 * phone can leave the network behind after one deliberate tap. */
function offlineRow(): HTMLElement {
  const status = h('p', { class: 'small muted', 'aria-live': 'polite', style: { margin: '0.2rem 0 0' } });
  const keeper = 'serviceWorker' in navigator && navigator.serviceWorker.controller
    ? 'The offline keeper stands watch: pages you have visited work with no wire.'
    : 'The offline keeper arms itself after the first visit to the live site.';
  void (async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage !== undefined) {
        status.textContent = `Kept so far: ~${(est.usage / (1024 * 1024)).toFixed(1)} MB on this device.`;
      }
    } catch { /* estimate is a nicety */ }
  })();
  const btn = h('button', {
    class: 'btn compact',
    onclick: async (e: Event) => {
      const button = e.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        const urls = new Set<string>();
        for (const track of audio.trackUrls()) urls.add(track);
        for (const manifest of ['art/manifest.json', 'audio/manifest.json']) {
          try {
            const res = await fetch(manifest);
            if (!res.ok) continue;
            const map = await res.json() as Record<string, string>;
            const dir = manifest.split('/')[0];
            for (const file of Object.values(map)) urls.add(`${dir}/${file}`);
          } catch { /* a missing manifest just means fewer files */ }
        }
        const list = [...urls];
        let done = 0;
        let failed = 0;
        for (const url of list) {
          try {
            const res = await fetch(url);
            if (!res.ok) failed++;
          } catch { failed++; }
          done++;
          if (done % 10 === 0 || done === list.length) {
            status.textContent = `Carrying the realm home: ${done} of ${list.length}…`;
          }
        }
        status.textContent = failed === 0
          ? `The whole realm is kept: ${list.length} files ready with no wire.`
          : `${list.length - failed} of ${list.length} kept. ${failed} would not come (try again on a better wire).`;
        const est = await navigator.storage?.estimate?.().catch(() => undefined);
        if (est?.usage !== undefined) {
          status.textContent += ` ~${(est.usage / (1024 * 1024)).toFixed(1)} MB on this device.`;
        }
      } finally {
        button.disabled = false;
      }
    },
  }, 'Keep the whole realm offline');
  return h('div', {},
    h('p', { class: 'small muted', style: { margin: '0 0 0.3rem' } }, keeper),
    btn,
    status,
  );
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
        () => note('Could not copy. Your browser said no.'),
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
    offlineRow(),
    h('h3', { class: 'settings-head' }, 'Credits'),
    h('div', { class: 'small muted', style: { lineHeight: '1.5' } },
      ...audio.credits().map((line) => h('p', { style: { margin: '0 0 0.3rem' } }, line)),
      h('p', { style: { margin: '0 0 0.3rem' } },
        'Illustrations: AI-generated (FLUX via Replicate), art-directed and curated for this game; CC BY-SA 4.0 to whatever extent rights exist.'),
      h('p', { style: { margin: '0 0 0.3rem' } },
        'Everything else (code, world, words, icons) made for this game. Code AGPL-3.0; story and art CC BY-SA 4.0.'),
      h('p', { style: { margin: '0' } },
        h('a', { href: 'https://github.com/michael-chipmates/realms-in-embers/blob/main/CREDITS.md', target: '_blank', rel: 'noopener' }, 'The full ledger of credits'),
        ' · ',
        h('a', { href: 'https://github.com/michael-chipmates/realms-in-embers', target: '_blank', rel: 'noopener' }, 'source'),
        ' · ',
        h('a', { href: '/legal.html', target: '_blank', rel: 'noopener' }, 'legal & privacy'),
      ),
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
