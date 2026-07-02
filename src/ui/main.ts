/**
 * Boot. For now this is the cartographer's table — forge and inspect realms
 * from a seed. It grows into the full title/setup flow as systems land.
 */
import './theme.css';
import { generateMap, MAP_SIZES } from '../engine/mapgen';
import { Rng } from '../engine/rng';
import type { MapSize } from '../engine/types';
import { h, mount } from './dom';
import { MapRenderer } from './mapRenderer';

const app = document.getElementById('app')!;

function randomSeed(): string {
  const words = [
    'ember', 'ash', 'crown', 'sundered', 'vigil', 'barrow', 'cinder', 'oath',
    'raven', 'thorn', 'mist', 'anvil', 'lantern', 'winter', 'harrow', 'gloam',
  ];
  const rng = new Rng(`${Date.now()}-${Math.random()}`);
  return `${rng.pick(words)}-${rng.pick(words)}-${rng.intRange(10, 99)}`;
}

function boot() {
  let seed = randomSeed();
  let size: MapSize = 'medium';

  const canvas = h('canvas', {
    style: { width: '100%', height: '100%', display: 'block', borderRadius: '4px' },
    'aria-label': 'Map of the Embermark, freshly forged',
    role: 'img',
  });
  const renderer = new MapRenderer(canvas);

  const seedInput = h('input', {
    class: 'input',
    value: seed,
    id: 'seed',
    spellcheck: 'false',
    autocomplete: 'off',
    style: { width: '16ch' },
    oninput: (e: Event) => {
      seed = (e.target as HTMLInputElement).value;
    },
  }) as HTMLInputElement;

  const sizeSelect = h(
    'select',
    {
      class: 'input',
      id: 'mapsize',
      onchange: (e: Event) => {
        size = (e.target as HTMLSelectElement).value as MapSize;
        forge();
      },
    },
    ...Object.entries(MAP_SIZES).map(([id, cfg]) =>
      h('option', { value: id, selected: id === 'medium' }, cfg.label),
    ),
  ) as HTMLSelectElement;

  const caption = h('p', { class: 'small italic muted', style: { textAlign: 'center', marginTop: '0.5rem' } });

  function forge() {
    const map = generateMap(new Rng(seed.trim() || 'the-sundered-age'), size);
    renderer.setView({ mapW: map.w, mapH: map.h, cells: map.cells, provinces: map.provinces });
    renderer.resize();
    renderer.fit();
    renderer.render();
    const coastal = map.provinces.filter((p) => p.coastal).length;
    const sites = map.provinces.filter((p) => p.site).length;
    caption.textContent = `“${seed.trim() || 'the-sundered-age'}” — ${map.provinces.length} provinces, ${coastal} coastal, ${sites} sites of note. The same seed forges the same realm, always.`;
  }

  const screen = h(
    'div',
    { class: 'room', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', gap: '1rem' } },
    h('h1', { class: 'title-display', style: { fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', marginTop: '0.5rem', position: 'relative', zIndex: '1' } }, 'Realms in Embers'),
    h('p', { class: 'italic muted', style: { position: 'relative', zIndex: '1' } }, 'The throne is forty years cold. The war for its ashes starts with a map.'),
    h(
      'div',
      { class: 'panel', style: { padding: '0.9rem 1.2rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center', position: 'relative', zIndex: '1' } },
      h('div', { class: 'field' }, h('label', { for: 'seed' }, 'Seed'), seedInput),
      h('div', { class: 'field' }, h('label', { for: 'mapsize' }, 'Realm size'), sizeSelect),
      h('button', { class: 'btn', onclick: () => { seed = randomSeed(); seedInput.value = seed; forge(); } }, 'New seed'),
      h('button', { class: 'btn btn-seal', onclick: forge }, 'Forge the realm'),
    ),
    h(
      'div',
      { style: { flex: '1', width: 'min(1100px, 96vw)', minHeight: '0', position: 'relative', zIndex: '1', border: '1px solid rgba(201,162,39,0.3)', borderRadius: '6px', boxShadow: 'var(--shadow-deep)', background: '#0c0906', padding: '10px' } },
      canvas,
    ),
    h('div', { style: { position: 'relative', zIndex: '1' } }, caption),
  );

  mount(app, screen);
  requestAnimationFrame(() => forge());
  window.addEventListener('resize', () => {
    renderer.resize();
    renderer.fit();
    renderer.render();
  });
}

boot();
