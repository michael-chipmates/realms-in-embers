/**
 * Setup — the muster table. Players, lords, difficulty, realm size, seed
 * (visible, shareable, previewed), victory paths, chronicle length, fog.
 */
import { LORDS, LORD_BY_ID } from '../../engine/content/lords';
import { CREEDS } from '../../engine/content/world';
import { MAP_SIZES, generateMap } from '../../engine/mapgen';
import { HANDICAPS, defaultSettings } from '../../engine/state';
import { Rng } from '../../engine/rng';
import type { Difficulty, GameSettings, MapSize, PlayerSetup, VictoryPath } from '../../engine/types';
import type { App } from '../app';
import { openLordGallery } from './gallery';
import { h, mount } from '../dom';
import { iconSvg } from '../icons';
import { MapRenderer } from '../mapRenderer';
import { sigilShield } from '../heraldry';
import { artSlot } from '../art';
import { tip } from '../tooltip';

export const VICTORY_INFO: Record<VictoryPath, { name: string; desc: string }> = {
  conquest: { name: 'Conquest', desc: 'Be the last banner standing.' },
  dominion: { name: 'Dominion', desc: 'Hold 55% of the realm for 3 consecutive seasons. Everyone sees the countdown.' },
  goldenAge: { name: 'Golden Age', desc: 'Be the realm’s richest lord, holding 900+ gold with average order 65+, for 4 consecutive seasons.' },
  legend: { name: 'Legend', desc: 'Complete the five chapters of the Grand Saga and rekindle the throne.' },
};

function randomSeed(): string {
  const words = ['ember', 'ash', 'crown', 'sundered', 'vigil', 'barrow', 'cinder', 'oath', 'raven', 'thorn', 'mist', 'anvil', 'lantern', 'winter', 'harrow', 'gloam'];
  const rng = new Rng(`${Date.now()}-${Math.random()}`);
  return `${rng.pick(words)}-${rng.pick(words)}-${rng.intRange(10, 99)}`;
}

/** One live preview-resize listener at most, across setup visits. */
let activeResize: (() => void) | null = null;

export function renderSetup(app: App, presetSeed?: string): void {
  const settings: GameSettings = { ...defaultSettings(), seed: presetSeed ?? randomSeed(), veteranChronicle: app.settings.veteranChronicle };
  settings.players = [
    { kind: 'human', lordId: 'random', difficulty: 'knight' },
    { kind: 'ai', lordId: 'random', difficulty: 'knight' },
    { kind: 'ai', lordId: 'random', difficulty: 'knight' },
    { kind: 'ai', lordId: 'random', difficulty: 'knight' },
  ];

  // ------------------------------------------------------------ preview
  const canvas = h('canvas', {
    style: { width: '100%', height: '100%', display: 'block' },
    role: 'img',
    'aria-label': 'Preview of the realm this seed forges',
  });
  const renderer = new MapRenderer(canvas);
  const forge = (): void => {
    const map = generateMap(new Rng(settings.seed.trim() || 'the-sundered-age'), settings.mapSize);
    renderer.setView({ mapW: map.w, mapH: map.h, cells: map.cells, provinces: map.provinces });
    renderer.resize();
    renderer.fit();
    renderer.render();
  };

  // -------------------------------------------------------------- seats
  const playerList = h('div', { class: 'setup-players' });

  function lordOptionLabel(id: string): string {
    if (id === 'random') return 'Fate decides';
    const lord = LORD_BY_ID[id];
    return `${lord.name}, ${lord.epithet}`;
  }

  function renderPlayers(): void {
    const takenLords = settings.players.map((p) => p.lordId);
    mount(playerList,
      h('div', { class: 'panel-title' }, 'The Claimants'),
      ...settings.players.map((player, idx) => {
        const lord = player.lordId !== 'random' ? LORD_BY_ID[player.lordId] : null;
        const creedDot = lord
          ? artSlot(`lord-${lord.id}`, sigilShield(lord.id, 26), { className: 'art-portrait-sm', alt: lord.name })
          : h('span', { class: 'creed-dot creed-dot-random', 'aria-hidden': 'true' }, '?');

        const kindSelect = h('select', {
          class: 'input compact',
          'aria-label': `Seat ${idx + 1}: who plays`,
          onchange: (e: Event) => {
            player.kind = (e.target as HTMLSelectElement).value as 'human' | 'ai';
            renderPlayers();
          },
        },
          h('option', { value: 'human', selected: player.kind === 'human' }, 'Mortal (you)'),
          h('option', { value: 'ai', selected: player.kind === 'ai' }, 'Rival lord (AI)'),
        );

        const lordSelect = h('select', {
          class: 'input compact',
          'aria-label': `Seat ${idx + 1}: which lord`,
          onchange: (e: Event) => {
            player.lordId = (e.target as HTMLSelectElement).value;
            renderPlayers();
          },
        },
          h('option', { value: 'random', selected: player.lordId === 'random' }, 'Fate decides'),
          ...LORDS.map((l) =>
            h('option', {
              value: l.id,
              selected: player.lordId === l.id,
              disabled: l.id !== player.lordId && takenLords.includes(l.id),
            }, `${lordOptionLabel(l.id)} — ${CREEDS[l.creed].name}`),
          ),
        );

        const diffSelect = player.kind === 'ai'
          ? h('select', {
              class: 'input compact',
              'aria-label': `Seat ${idx + 1}: difficulty`,
              onchange: (e: Event) => {
                player.difficulty = (e.target as HTMLSelectElement).value as Difficulty;
                renderPlayers();
              },
            },
              ...(['squire', 'knight', 'warlord'] as const).map((d) =>
                h('option', { value: d, selected: player.difficulty === d }, d[0].toUpperCase() + d.slice(1)),
              ),
            )
          : null;
        if (diffSelect && player.difficulty) {
          tip(diffSelect, () => {
            const el = h('div', { class: 'tip-plain' }, HANDICAPS[player.difficulty].label);
            return el;
          });
        }

        const removeBtn = settings.players.length > 2
          ? h('button', {
              class: 'btn btn-quiet compact',
              'aria-label': `Remove seat ${idx + 1}`,
              html: iconSvg('close', 14),
              onclick: () => {
                settings.players.splice(idx, 1);
                renderPlayers();
              },
            })
          : null;

        const galleryBtn = h('button', {
          class: 'btn btn-quiet compact',
          'aria-label': `Seat ${idx + 1}: browse the lords`,
          html: iconSvg('crownSmall', 15),
          onclick: () => {
            openLordGallery({
              title: `Seat ${idx + 1} — whose banner?`,
              initial: player.lordId !== 'random' ? player.lordId : null,
              taken: settings.players.filter((p, i) => i !== idx && p.lordId !== 'random').map((p) => p.lordId),
              onPick: (lordId) => { player.lordId = lordId; renderPlayers(); },
              onFate: () => { player.lordId = 'random'; renderPlayers(); },
              onCancel: () => undefined,
            });
          },
        });
        tip(galleryBtn, 'Leaf through the twelve lords — portraits, both abilities, temperament.');

        const row = h('div', { class: 'setup-player-row' }, creedDot, kindSelect, lordSelect, galleryBtn, diffSelect, removeBtn);
        if (lord) {
          tip(row, () => h('div', { class: 'tip-plain', style: { maxWidth: '300px' } },
            h('strong', {}, `${lord.name}, ${lord.epithet}`),
            h('p', { class: 'small', style: { margin: '0.3em 0' } }, lord.blurb),
            h('p', { class: 'small' }, h('em', {}, `${lord.perk.label} (legacy): `), lord.perk.desc),
            h('p', { class: 'small' }, h('em', {}, `${lord.signature.name} (signature): `), lord.signature.desc),
          ));
        }
        return row;
      }),
      settings.players.length < 6
        ? h('button', {
            class: 'btn compact',
            style: { margin: '0.5rem' },
            onclick: () => {
              settings.players.push({ kind: 'ai', lordId: 'random', difficulty: 'knight' } as PlayerSetup);
              renderPlayers();
            },
          }, '+ Another claimant')
        : null,
      h('p', { class: 'small muted', style: { padding: '0 0.9rem 0.6rem' } },
        'Two or more mortals at one table means hotseat — the map hides between seasons.'),
    );
  }

  // ------------------------------------------------------------- fields
  const seedInput = h('input', {
    class: 'input', value: settings.seed, id: 'setup-seed', spellcheck: 'false', autocomplete: 'off',
    style: { width: '15ch' },
    oninput: (e: Event) => {
      settings.seed = (e.target as HTMLInputElement).value;
      forge();
    },
  }) as HTMLInputElement;

  const sizeSelect = h('select', {
    class: 'input', id: 'setup-size',
    onchange: (e: Event) => {
      settings.mapSize = (e.target as HTMLSelectElement).value as MapSize;
      forge();
    },
  }, ...Object.entries(MAP_SIZES).map(([id, cfg]) => h('option', { value: id, selected: id === settings.mapSize }, cfg.label)));

  const lengthSelect = h('select', {
    class: 'input', id: 'setup-length',
    onchange: (e: Event) => {
      settings.maxTurns = parseInt((e.target as HTMLSelectElement).value, 10);
    },
  },
    h('option', { value: '40' }, 'Short — 40 seasons'),
    h('option', { value: '60', selected: true }, 'Standard — 60 seasons'),
    h('option', { value: '90' }, 'Long — 90 seasons'),
  );

  const fogToggle = h('input', {
    type: 'checkbox', id: 'setup-fog',
    onchange: (e: Event) => {
      settings.fogOfWar = (e.target as HTMLInputElement).checked;
    },
  });

  const victoryBoxes = h('div', { class: 'victory-grid' },
    ...(Object.keys(VICTORY_INFO) as VictoryPath[]).map((path) => {
      const box = h('input', {
        type: 'checkbox',
        id: `vic-${path}`,
        checked: true,
        onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked;
          settings.victoryPaths = on
            ? [...settings.victoryPaths, path].filter((v, i, a) => a.indexOf(v) === i)
            : settings.victoryPaths.filter((p) => p !== path);
        },
      });
      const label = h('label', { class: 'victory-option', for: `vic-${path}` }, box, h('span', {}, VICTORY_INFO[path].name));
      tip(label, VICTORY_INFO[path].desc);
      return label;
    }),
  );

  const errLine = h('p', { class: 'small', style: { color: 'var(--danger)', minHeight: '1.1em', margin: '0' } });

  const startBtn = h('button', {
    class: 'btn btn-seal', style: { fontSize: '1.05rem', padding: '0.7rem 2rem' },
    onclick: () => {
      if (settings.players.filter((p) => p.kind === 'human').length === 0) {
        errLine.textContent = 'At least one mortal must sit at the table.';
        return;
      }
      if (settings.victoryPaths.length === 0) settings.victoryPaths = ['conquest'];
      settings.seed = settings.seed.trim() || randomSeed();
      app.startGame(settings);
    },
  }, 'Begin the Chronicle');

  const screen = h('div', { class: 'room setup-screen' },
    h('header', { class: 'setup-head' },
      h('button', { class: 'btn btn-quiet', onclick: () => app.toTitle() }, '‹ To the title'),
      h('h1', { class: 'title-display', style: { fontSize: '1.3rem' } }, 'Muster the Age'),
      startBtn,
    ),
    h('div', { class: 'setup-grid' },
      h('div', { class: 'setup-left' },
        h('div', { class: 'panel setup-config' },
          h('div', { class: 'field' }, h('label', { for: 'setup-seed' }, 'Seed'), h('div', { style: { display: 'flex', gap: '0.3rem' } },
            seedInput,
            h('button', {
              class: 'btn', 'aria-label': 'New random seed', html: iconSvg('dice', 18),
              onclick: () => {
                settings.seed = randomSeed();
                seedInput.value = settings.seed;
                forge();
              },
            }),
          )),
          h('div', { class: 'field' }, h('label', { for: 'setup-size' }, 'Realm'), sizeSelect),
          h('div', { class: 'field' }, h('label', { for: 'setup-length' }, 'Chronicle'), lengthSelect),
          h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '0.4rem', minHeight: '44px' } }, fogToggle, 'Fog of war'),
        ),
        h('div', { class: 'panel', style: { marginTop: '0.6rem' } },
          h('div', { class: 'panel-title' }, 'Roads to the throne'),
          victoryBoxes,
        ),
        h('div', { class: 'panel', style: { marginTop: '0.6rem' } }, playerList),
        h('div', { style: { display: 'flex', gap: '1rem', alignItems: 'center', margin: '0.7rem 0 0.9rem', flexWrap: 'wrap' } }, errLine),
      ),
      h('div', { class: 'setup-right panel', style: { padding: '8px' } }, canvas),
    ),
  );

  mount(app.root, screen);
  renderPlayers();
  requestAnimationFrame(() => forge());
  const onResize = (): void => {
    if (!document.contains(canvas)) {
      window.removeEventListener('resize', onResize);
      if (activeResize === onResize) activeResize = null;
      return;
    }
    forge();
  };
  if (activeResize) window.removeEventListener('resize', activeResize);
  activeResize = onResize;
  window.addEventListener('resize', onResize);
}
