/**
 * The left-hand panel: whatever is selected, fully inspectable — province
 * economics with itemized causes, armies with orders, recruit & build.
 */
import { BUILDINGS, BUILD_ORDER, TERRAIN } from '../../engine/content/world';
import { RECRUITABLE, UNITS, VET_NAMES } from '../../engine/content/units';
import { SITE_NAMES } from '../../engine/content/names';
import { buildingCostFor, orderDrift, provinceIncome, unitCostFor } from '../../engine/economy';
import { heroDerived } from '../../engine/heroFx';
import { armiesIn, heroesOf, lordOf } from '../../engine/helpers';
import type { Army, Province, UnitTypeId } from '../../engine/types';
import { clear, h, mount } from '../dom';
import { fmt, lordDisplay, signed } from '../format';
import { iconSvg } from '../icons';
import { breakdown, tip } from '../tooltip';
import type { GameScreen } from '../screens/game';

export function renderSelectionPanel(screen: GameScreen, root: HTMLElement): void {
  const state = screen.state;
  const sel = screen.sel;
  if (sel.provinceId === null) {
    clear(root);
    root.classList.add('side-panel-empty');
    return;
  }
  root.classList.remove('side-panel-empty');
  const p = state.provinces[sel.provinceId];
  const viewer = screen.viewerId();
  const fog = state.settings.fogOfWar && !state.players[viewer].seen.includes(p.id);

  if (fog) {
    mount(root, h('div', { class: 'panel side-card' },
      h('div', { class: 'panel-title' }, 'Uncharted'),
      h('p', { class: 'small muted', style: { padding: '0.8rem' } },
        'No survey, no spies, no stories. The vellum is blank here until someone of yours sees it.'),
    ));
    return;
  }

  const army = sel.armyId !== null ? state.armies[sel.armyId] : null;

  // phones: a grab-bar to drop the sheet out of the map's way
  const handle = screen.isMobile()
    ? h('button', {
        class: 'sheet-handle',
        'aria-expanded': String(!screen.sheetCollapsed),
        'aria-label': screen.sheetCollapsed ? 'Show details' : 'Hide details, show the map',
        onclick: () => screen.toggleSheet(),
      },
        h('span', { class: 'sheet-handle-bar' }),
        screen.sheetCollapsed
          ? `${p.name} — tap for details`
          : 'Hide — show the map',
      )
    : null;

  if (screen.isMobile() && screen.sheetCollapsed) {
    mount(root, handle);
    return;
  }

  mount(root,
    handle,
    renderProvinceCard(screen, p),
    ...armiesIn(state, p.id).map((a) => renderArmyCard(screen, a, a.id === sel.armyId)),
    army === null && p.owner === viewer && screen.current().kind === 'human' ? renderBuildCard(screen, p) : null,
    army === null && p.owner === viewer && screen.current().kind === 'human' ? renderRecruitCard(screen, p) : null,
  );
}

// ------------------------------------------------------------- province

function renderProvinceCard(screen: GameScreen, p: Province): HTMLElement {
  const state = screen.state;
  const income = provinceIncome(state, p);
  const drift = orderDrift(state, p);
  const owner = p.owner >= 0 ? lordDisplay(state, p.owner) : null;

  const incomeStat = h('div', { class: 'stat-block' },
    h('span', { html: iconSvg('gold', 15) }), h('b', {}, fmt(income.total)), h('span', { class: 'small muted' }, '/season'));
  tip(incomeStat, () => breakdown(`Income of ${p.name}`, income.lines, `${fmt(income.total)} gold each season`));

  const orderStat = h('div', { class: 'stat-block' },
    h('span', { html: iconSvg('order', 15) }), h('b', {}, fmt(p.order)),
    h('span', { class: `small ${drift.total >= 0 ? 'pos' : 'neg'}` }, signed(drift.total)));
  tip(orderStat, () => breakdown(`Order in ${p.name} (0–100)`, drift.lines,
    p.order < 25 ? 'DANGER: below 25, rebellion brews each season' : `Drifting ${signed(drift.total)} each season`));

  const prosperityStat = h('div', { class: 'stat-block' },
    h('span', { html: iconSvg('wheat', 15) }), h('b', {}, `${Math.round(p.prosperity * 100)}%`));
  tip(prosperityStat, 'Prosperity multiplies income. It follows order — patiently.');

  return h('div', { class: 'panel side-card' },
    h('div', { class: 'side-card-head' },
      h('div', {},
        h('div', { class: 'side-card-title' }, p.name),
        h('div', { class: 'small muted' },
          `${TERRAIN[p.terrain].name}${p.coastal ? ' · coast' : ''}${p.site ? ` · ${SITE_NAMES[p.site]}` : ''}`),
      ),
      owner
        ? h('div', { class: 'owner-chip', style: { borderColor: owner.color } },
            h('span', { class: 'lord-swatch', style: { background: owner.color } }), owner.name)
        : h('div', { class: 'owner-chip muted' }, 'Free province'),
    ),
    h('div', { class: 'stat-row' }, incomeStat, orderStat, prosperityStat),
    p.buildings.length > 0
      ? h('div', { class: 'chip-row' }, ...p.buildings.map((b) => {
          const chip = h('span', { class: 'chip', html: `${iconSvg(BUILDINGS[b].icon, 13)} ${BUILDINGS[b].name}` });
          tip(chip, () => h('div', { class: 'tip-plain' }, h('b', {}, BUILDINGS[b].name), h('p', { class: 'small' }, BUILDINGS[b].desc), h('p', { class: 'small italic muted' }, BUILDINGS[b].flavor)));
          return chip;
        }))
      : null,
    p.buildQueue
      ? h('p', { class: 'small muted build-note' }, h('span', { html: iconSvg('hammer', 12) }), `Building ${BUILDINGS[p.buildQueue.id].name} — ${p.buildQueue.turnsLeft} ${p.buildQueue.turnsLeft === 1 ? 'season' : 'seasons'} left`)
      : null,
    p.recruitQueue
      ? h('p', { class: 'small muted build-note' }, h('span', { html: iconSvg('banner', 12) }), `Mustering ${UNITS[p.recruitQueue.unit].name}`)
      : null,
    p.mods.length > 0
      ? h('div', { class: 'chip-row' }, ...p.mods.map((m) =>
          h('span', { class: 'chip chip-magic' }, `${m.label} (${m.turnsLeft})`)))
      : null,
    h('p', { class: 'flavor-line italic' }, p.flavor),
  );
}

// ----------------------------------------------------------------- army

function renderArmyCard(screen: GameScreen, army: Army, selected: boolean): HTMLElement {
  const state = screen.state;
  const owner = lordDisplay(state, army.owner);
  const mine = army.owner === screen.viewerId() && screen.current().kind === 'human' && army.owner === state.current;
  const kindLabel = army.kind === 'rebels' ? 'Rebels' : army.kind === 'marauders' ? 'Wolfsheads' : army.kind === 'revenants' ? 'Revenants' : null;

  const unitRows = army.units.map((u, idx) => {
    const def = UNITS[u.type];
    const row = h('div', { class: 'unit-row' },
      h('span', { class: 'unit-icon', html: iconSvg(def.icon, 16) }),
      h('span', { class: 'unit-name' }, def.name),
      h('span', { class: 'unit-vet small muted' }, u.vet > 0 ? VET_NAMES[u.vet] : ''),
      h('span', { class: 'unit-hits', 'aria-label': `${u.hits} of ${def.hits} hits` },
        ...Array.from({ length: def.hits }, (_, i) =>
          h('span', { class: `pip ${i < u.hits ? 'pip-full' : ''}` })),
      ),
      mine
        ? h('button', {
            class: 'btn btn-quiet compact', 'aria-label': `Disband ${def.name}`, html: iconSvg('close', 12),
            onclick: (e: Event) => {
              e.stopPropagation();
              screen.dispatch({ t: 'disband', armyId: army.id, index: idx });
            },
          })
        : null,
    );
    tip(row, () => h('div', { class: 'tip-plain' },
      h('b', {}, def.name),
      h('p', { class: 'small' }, `Attack ${def.atk} · Defense ${def.def} · ${def.hits} hits · upkeep ${def.upkeep}`),
      def.traits.length > 0 ? h('p', { class: 'small' }, `Traits: ${def.traits.join(', ')}`) : null,
      h('p', { class: 'small italic muted' }, def.flavor),
    ));
    return row;
  });

  const heroRows = army.heroIds.map((hid) => {
    const hero = state.heroes[hid];
    if (!hero) return null;
    const d = heroDerived(state, hero);
    const row = h('div', { class: 'unit-row hero-row' },
      h('span', { class: 'unit-icon', style: { color: 'var(--gold-bright)' }, html: iconSvg('hero', 16) }),
      h('span', { class: 'unit-name' }, `${hero.name} · L${hero.level}`),
      h('span', { class: 'small muted' }, hero.cls),
    );
    tip(row, () => h('div', { class: 'tip-plain' },
      h('b', {}, `${hero.name}, ${hero.epithet}`),
      h('p', { class: 'small' }, `Might ${d.might} · Lore ${d.lore} · Guile ${d.guile} · Leadership ${d.leadership}`),
    ));
    return row;
  });

  const stanceRow = mine
    ? h('div', { class: 'stance-row' },
        ...(['bold', 'measured', 'wary'] as const).map((s) => {
          const btn = h('button', {
            class: `stance-btn ${army.stance === s ? 'active' : ''}`,
            onclick: () => {
              screen.dispatch({ t: 'setStance', armyId: army.id, stance: s });
            },
          }, s[0].toUpperCase() + s.slice(1));
          tip(btn, s === 'bold'
            ? 'Bold: +10% strength, never yields. Glory or the crows.'
            : s === 'measured'
              ? 'Measured: fights honestly, withdraws if the day is clearly lost.'
              : 'Wary: −12% strength, but breaks off early and saves the companies.');
          return btn;
        }),
      )
    : null;

  return h('div', {
    class: `panel side-card army-card ${selected ? 'army-selected' : ''}`,
    onclick: () => screen.selectArmy(army.id),
    style: { cursor: 'pointer' },
  },
    h('div', { class: 'side-card-head' },
      h('div', {},
        h('div', { class: 'side-card-title small-caps' },
          kindLabel ? `${kindLabel} — ${army.units.length} ${army.units.length === 1 ? 'company' : 'companies'}`
            : `Army — ${army.units.length} ${army.units.length === 1 ? 'company' : 'companies'}`),
        h('div', { class: 'small muted' }, army.owner >= 0 ? owner.name : 'Under no banner'),
      ),
      army.owner >= 0 ? h('span', { class: 'lord-swatch', style: { background: owner.color } }) : null,
      mine && army.moved ? h('span', { class: 'chip' }, 'Marched') : null,
    ),
    ...heroRows,
    ...unitRows,
    stanceRow,
    mine && !army.moved && screen.targets.length > 0 && selected
      ? h('p', { class: 'small muted', style: { padding: '0.2rem 0.8rem 0.6rem' } },
          'Click a glowing province to march. Crossed swords mean a fight.')
      : null,
  );
}

// ---------------------------------------------------------------- build

function renderBuildCard(screen: GameScreen, p: Province): HTMLElement | null {
  const state = screen.state;
  const pid = state.current;
  const player = state.players[pid];
  if (p.buildQueue) return null;
  const options = BUILD_ORDER.filter((b) => {
    const def = BUILDINGS[b];
    if (p.buildings.includes(b)) return false;
    if (def.requires && !p.buildings.includes(def.requires)) return false;
    if (def.terrain && !def.terrain.includes(p.terrain)) return false;
    if (def.coastalOnly && !p.coastal) return false;
    return true;
  });
  if (options.length === 0) return null;
  return h('div', { class: 'panel side-card' },
    h('div', { class: 'panel-title' }, 'Raise works'),
    h('div', { class: 'option-grid' },
      ...options.map((b) => {
        const def = BUILDINGS[b];
        const { cost, lines } = buildingCostFor(state, pid, b);
        const afford = player.gold >= cost;
        const btn = h('button', {
          class: 'option-btn',
          disabled: !afford,
          onclick: () => {
            screen.dispatch({ t: 'build', province: p.id, building: b });
          },
        },
          h('span', { html: iconSvg(def.icon, 18) }),
          h('span', { class: 'option-name' }, def.name),
          h('span', { class: 'option-cost' }, `${cost}`, iconElInline()),
        );
        tip(btn, () => h('div', { class: 'tip-plain' },
          h('b', {}, `${def.name} — ${cost} gold, ${def.turns} ${def.turns === 1 ? 'season' : 'seasons'}`),
          h('p', { class: 'small' }, def.desc),
          ...lines.map((l) => h('p', { class: 'small pos' }, l)),
          h('p', { class: 'small italic muted' }, def.flavor),
        ));
        return btn;
      }),
    ),
  );
}

function iconElInline(): HTMLElement {
  return h('span', { html: iconSvg('gold', 12), style: { opacity: '0.8' } });
}

// -------------------------------------------------------------- recruit

function renderRecruitCard(screen: GameScreen, p: Province): HTMLElement | null {
  const state = screen.state;
  const pid = state.current;
  const player = state.players[pid];
  if (p.recruitQueue) return null;
  const fx = lordOf(player).perk.fx;
  const options = RECRUITABLE.filter((id) => {
    const def = UNITS[id];
    if (!def.recruit) return false;
    if (def.recruit.building && !p.buildings.includes(def.recruit.building)) return false;
    if (def.recruit.terrain && !def.recruit.terrain.includes(p.terrain)) {
      if (!(id === 'cragguard' && fx.cragguardInHills && p.terrain === 'hills')) return false;
    }
    if (def.recruit.creed && lordOf(player).creed !== def.recruit.creed) return false;
    if (id === 'revenants' && (!fx.revenantsAtBarrows || p.site !== 'barrow')) return false;
    return true;
  });
  if (options.length === 0) return null;
  return h('div', { class: 'panel side-card' },
    h('div', { class: 'panel-title' }, 'Muster companies'),
    h('div', { class: 'option-grid' },
      ...options.map((id: UnitTypeId) => {
        const def = UNITS[id];
        const { cost, lines } = unitCostFor(state, pid, id);
        const afford = player.gold >= cost;
        const btn = h('button', {
          class: 'option-btn',
          disabled: !afford,
          onclick: () => {
            screen.dispatch({ t: 'recruit', province: p.id, unit: id });
          },
        },
          h('span', { html: iconSvg(def.icon, 18) }),
          h('span', { class: 'option-name' }, def.name),
          h('span', { class: 'option-cost' }, `${cost}`, iconElInline()),
        );
        tip(btn, () => h('div', { class: 'tip-plain' },
          h('b', {}, `${def.name} — ${cost} gold, ready next season`),
          h('p', { class: 'small' }, `Attack ${def.atk} · Defense ${def.def} · ${def.hits} hits · upkeep ${def.upkeep}/season`),
          h('p', { class: 'small' }, def.desc),
          ...lines.map((l) => h('p', { class: 'small pos' }, l)),
          h('p', { class: 'small italic muted' }, def.flavor),
        ));
        return btn;
      }),
    ),
  );
}
