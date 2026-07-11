/**
 * The Codex — the realm's handbook. Every rule of the game, in plain words,
 * with every number rendered from the engine's own constants so the book can
 * never drift from the battlefield. Two voices, never mixed: rules text is a
 * patient friend across the table; flavor lines are Osperan's.
 */
import { COMBAT_TUNING, FERVOR_COST, FERVOR_MULT } from '../../engine/combat';
import { RECRUITABLE, TRAIT_INFO, UNITS, vetMult } from '../../engine/content/units';
import type { UnitTrait } from '../../engine/content/units';
import { BUILDINGS, BUILD_ORDER, CREEDS, COASTAL_INCOME, TERRAIN } from '../../engine/content/world';
import { ALL_SPELLS, SPELLS } from '../../engine/content/spells';
import { HERO_CLASSES, MAX_HERO_LEVEL, xpForLevel } from '../../engine/heroes';
import { SKILLS, SKILLS_BY_CLASS, SKILL_LEVELS } from '../../engine/content/skills';
import { ARTIFACTS, ARTIFACT_IDS } from '../../engine/content/artifacts';
import { QUESTS, SAGA_QUESTS, TIER_DEATH_RISK, TIER_NAMES } from '../../engine/content/quests';
import { LORDS } from '../../engine/content/lords';
import { TAX_FX } from '../../engine/economy';
import { TEACHINGS } from '../../engine/teachings';
import {
  DOMINION_FLOOR, DOMINION_ROUNDS, DOMINION_SHARE, GOLDEN_GOLD, GOLDEN_ORDER,
  GOLDEN_ROUNDS, WEARINESS_TURN, dominionShareAt,
} from '../../engine/victory';
import type { HeroClass, Terrain, UnitTypeId } from '../../engine/types';
import { artSlot } from '../art';
import { clear, h, mount } from '../dom';
import { classGrowthWords } from '../format';
import { iconSvg } from '../icons';
import { openModal } from '../modal';
import { openLedgerOverlay } from './overlays';
import type { GameScreen } from '../screens/game';

export type CodexSection =
  | 'battle' | 'units' | 'works' | 'realm' | 'magic' | 'heroes'
  | 'quests' | 'artifacts' | 'twelve' | 'lords' | 'enchant' | 'victory' | 'marginalia';

const SECTIONS: { id: CodexSection; icon: string; title: string }[] = [
  { id: 'battle', icon: 'swords', title: 'The Field of Battle' },
  { id: 'units', icon: 'banner', title: 'Companies' },
  { id: 'works', icon: 'hammer', title: 'Works & Ground' },
  { id: 'realm', icon: 'gold', title: 'Coin & Order' },
  { id: 'magic', icon: 'ember', title: 'Emberlight' },
  { id: 'heroes', icon: 'hero', title: 'The Court' },
  { id: 'quests', icon: 'quest', title: 'Quests & the Saga' },
  { id: 'artifacts', icon: 'vault', title: 'Artifacts' },
  { id: 'twelve', icon: 'crownSmall', title: 'The Twelve Lords' },
  { id: 'lords', icon: 'handshake', title: 'The Other Lords' },
  { id: 'enchant', icon: 'ward', title: 'Enchantments' },
  { id: 'victory', icon: 'laurel', title: 'The Five Endings' },
  { id: 'marginalia', icon: 'quill', title: 'Marginalia' },
];

/** One muted line for tooltips elsewhere: where the full chapter lives. */
export function codexHint(): HTMLElement {
  return h('p', { class: 'small muted codex-hint' }, 'The Codex (c) holds the full chapter.');
}

export function openCodexOverlay(screen: GameScreen, anchor: CodexSection = 'battle'): void {
  const body = h('div', { class: 'codex-body' });
  openModal('The Codex', body, { wide: true, className: 'codex-modal' });
  let current: CodexSection = anchor;
  const page = h('article', { class: 'codex-page' });
  const nav = h('nav', { class: 'codex-nav', 'aria-label': 'Codex chapters' });

  const renderNav = (): void => {
    mount(nav, ...SECTIONS.map((s) =>
      h('button', {
        class: `codex-nav-btn ${s.id === current ? 'active' : ''}`,
        onclick: () => { current = s.id; renderNav(); renderPage(); },
      }, h('span', { html: iconSvg(s.icon, 15) }), s.title),
    ));
  };
  const goTo = (id: CodexSection): void => { current = id; renderNav(); renderPage(); };
  const renderPage = (): void => {
    clear(page);
    const def = SECTIONS.find((s) => s.id === current)!;
    page.appendChild(h('div', { class: 'codex-page-head' },
      artSlot(`codex-${current}`, h('span', { class: 'codex-page-glyph', html: iconSvg(def.icon, 26) }), { className: 'art-codex-head', alt: '' }),
      h('h3', { class: 'codex-page-title' }, def.title),
    ));
    page.appendChild(RENDERERS[current](screen));
    // leaf through like a book: the previous and next chapter, always in reach
    const idx = SECTIONS.findIndex((s) => s.id === current);
    const prev = SECTIONS[(idx - 1 + SECTIONS.length) % SECTIONS.length];
    const next = SECTIONS[(idx + 1) % SECTIONS.length];
    page.appendChild(h('div', { class: 'codex-pager' },
      h('button', { class: 'btn compact', onclick: () => goTo(prev.id) }, `‹ ${prev.title}`),
      h('button', { class: 'btn compact', onclick: () => goTo(next.id) }, `${next.title} ›`),
    ));
    // the modal panel is the scroller — a fresh chapter starts at its top
    const scroller = body.closest('.modal-panel');
    if (scroller) scroller.scrollTop = 0;
  };
  renderNav();
  renderPage();
  mount(body, nav, page);
  // arrow keys leaf too, when no control inside the modal wants them
  body.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const idx = SECTIONS.findIndex((s) => s.id === current);
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(SECTIONS[(idx + 1) % SECTIONS.length].id); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(SECTIONS[(idx - 1 + SECTIONS.length) % SECTIONS.length].id); }
  });
}

// ------------------------------------------------------------------ helpers

const pct = (mult: number): string => `${mult >= 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)}%`;
/** A fraction as clean percent digits — floats like 0.28×100 must never leak. */
const pc = (frac: number): number => Math.round(frac * 100);
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

function para(text: string): HTMLElement {
  return h('p', { class: 'codex-p' }, text);
}
function flavor(text: string): HTMLElement {
  return h('p', { class: 'codex-p small italic muted' }, text);
}
function head(text: string): HTMLElement {
  return h('h4', { class: 'settings-head' }, text);
}
function fact(label: string, text: string): HTMLElement {
  return h('p', { class: 'codex-fact' }, h('b', {}, label + '. '), text);
}
function tableWrap(table: HTMLElement): HTMLElement {
  return h('div', { class: 'codex-table-wrap' }, table);
}

// ------------------------------------------------------------------ battle

function renderBattle(): HTMLElement {
  const T = COMBAT_TUNING;
  const mods: [string, string][] = [
    ['The ground itself', Object.values(TERRAIN).filter((t) => t.defense !== 1).map((t) => `${t.name} ${pct(t.defense)}`).join(', ') + ' for the defenders.'],
    ['Walls', `Palisade +${pc(T.walls.walls1)}%, Stone Walls +${pc(T.walls.walls2)}%, High Keep +${pc(T.walls.walls3)}% — for the defenders, on their own land. One company of Siegeworks in the attack levels all of it.`],
    ['Crossing a river', `The attackers fight at ${pct(T.riverMult)}. Flying companies ignore rivers.`],
    ['Landing from ships', `The attackers fight at ${pct(T.seaMult)}.`],
    ['Charge', `+${pc(T.chargeMult - 1)}% in the first clash, on open ground (Meadowlands or Highdowns) — unless the enemy fields a bracing company, which cancels it.`],
    ['Ambush', `+${pc(T.ambushMult - 1)}% in the first clash, when attacking.`],
    ['Brace', `+${pc(T.braceMult - 1)}% when defending, and enemy charges break on the spears.`],
    ['Terror', `The enemy fights at ${pct(T.terrorMult)} — unless they also field terror, an unyielding company, or a lord who does not scare.`],
    ['Leadership', `Your best hero adds +${pc(T.leadershipPerLevel)}% per point of leadership, up to +${pc(T.leadershipCap)}%.`],
    ['Ember Adepts', `+${pc(T.adeptEach)}% per company of casters, up to +${pc(T.adeptCap)}% — and they let battle-spells weave (the Emberlight chapter has the spellbook).`],
    ['Stance', `Bold fights at ${pct(T.stance.bold)}. Wary fights at ${pct(T.stance.wary)}.`],
    ['Emberlight fervor', `An attacker may burn ${FERVOR_COST} raw Emberlight before committing: the whole assault fights at ${pct(FERVOR_MULT)}. Always offered in the odds preview, never automatic.`],
  ];
  return h('div', {},
    para(`A battle opens with the volley: every ranged company on both sides looses once, before the lines meet. Then the lines clash, up to ${T.clashes} times. If both armies still stand at the end, night falls and the field stays with the defender.`),
    para(`Each company brings its attack and defense to every clash — attackers lean on attack, defenders on defense. That strength is scaled by the company's remaining health, its veterancy (+${pc(vetMult(1) - 1)}% per rank, two ranks), the ground, and the modifiers below. A hero adds their might, growing with level. Each clash then deals casualties in proportion to power, swinging about ±${pc(COMBAT_TUNING.swingHi - 1)}% either way.`),
    head('Leaving the field'),
    para(`From the second clash on, a side that is badly outmatched withdraws rather than dying where it stands. Wary armies leave early (under ${pc(T.withdrawAt.wary)}% of enemy strength), measured armies at ${pc(T.withdrawAt.measured)}%, bold armies only at ${pc(T.withdrawAt.bold)}%. Withdrawing costs one parting blow at half strength. Neutral defenders and the unyielding never leave.`),
    para(`A beaten army falls back to a friendly neighboring province if one exists. If none does, it disperses — heroes try to slip away home, wounded, and some do not make it.`),
    head('What bends the odds'),
    ...mods.map(([label, text]) => fact(label, text)),
    fact('Armor', `An armored company turns aside ${pc(T.armoredTurn)}% of the hits that reach it.`),
    head('After the battle'),
    para(`Surviving companies on the winning side have a fair chance to season into veterans. Heroes on both sides risk wounds or death — more when the day was lost, more when the casualties ran high, less if they carry a death-save. Heroes also grow: experience flows from the enemy hits your side dealt.`),
    para('Every one of these numbers appears by name in the odds preview before you commit a single soldier. If the preview does not list it, it is not in the battle.'),
    flavor('Osperan: I have chronicled four hundred battles. The ones worth retelling were decided before the first arrow — by someone reading the ground, and someone else declining to.'),
  );
}

// ------------------------------------------------------------------- units

function requirementText(id: UnitTypeId): string {
  const r = UNITS[id].recruit;
  if (!r) return 'Never mustered — the realm produces these on its own.';
  const parts: string[] = [];
  if (r.building) parts.push(`a ${BUILDINGS[r.building].name}`);
  if (r.terrain) parts.push(r.terrain.map((t: Terrain) => TERRAIN[t].name).join(' or '));
  if (r.creed) parts.push(`${CREEDS[r.creed].name} lords only`);
  if (id === 'revenants') parts.push('a barrow, and a lord the dead will answer');
  return parts.length > 0 ? `Needs ${parts.join(', ')}.` : 'Mustered anywhere.';
}

function renderUnits(): HTMLElement {
  const tiers: { title: string; ids: UnitTypeId[] }[] = [1, 2, 3].map((tier) => ({
    title: tier === 1 ? 'Tier 1 — the levy' : tier === 2 ? 'Tier 2 — trained soldiers (Musterfield)' : 'Tier 3 — elites and engines (War Foundry)',
    ids: RECRUITABLE.filter((id) => UNITS[id].tier === tier && UNITS[id].recruit !== null),
  }));
  const neutral = (Object.keys(UNITS) as UnitTypeId[]).filter((id) => UNITS[id].recruit === null);

  const unitCard = (id: UnitTypeId): HTMLElement => {
    const def = UNITS[id];
    return h('div', { class: 'codex-entry' },
      artSlot(`unit-${id}`, h('span', { class: 'codex-entry-glyph', html: iconSvg(def.icon, 22) }), { className: 'art-codex-entry', alt: def.name }),
      h('div', { class: 'codex-entry-body' },
        h('div', { class: 'codex-entry-title' }, def.name,
          h('span', { class: 'small muted' }, def.cost > 0 ? ` ${def.cost} gold · upkeep ${def.upkeep}/season` : '')),
        h('p', { class: 'small' }, `Attack ${def.atk} · Defense ${def.def} · ${def.hits} hits`),
        h('p', { class: 'small' }, def.desc),
        h('p', { class: 'small muted' }, requirementText(id)),
        ...def.traits.filter((t) => TRAIT_INFO[t]).map((t) =>
          h('p', { class: 'small trait-line' }, h('b', {}, cap(t) + '. '), TRAIT_INFO[t]!)),
        h('p', { class: 'small italic muted' }, def.flavor),
      ),
    );
  };

  return h('div', {},
    para(`Sixteen kinds of company march in this realm. You can muster thirteen of them; rebels and wolfsheads muster themselves, and revenants answer to very few. A company is ready the season after you pay for it. Veterans fight +${pc(vetMult(1) - 1)}% per rank, and survivors of a won battle often earn one.`),
    ...tiers.flatMap((t) => [head(t.title), ...t.ids.map(unitCard)]),
    head('The realm’s own'),
    ...neutral.map(unitCard),
    head('Every trait, in one place'),
    ...(Object.keys(TRAIT_INFO) as UnitTrait[]).map((t) =>
      h('p', { class: 'small trait-line' }, h('b', {}, cap(t) + '. '), TRAIT_INFO[t]!)),
  );
}

// ------------------------------------------------------------------- works

function renderWorks(): HTMLElement {
  return h('div', {},
    para('A province can hold any number of works, built one at a time. What a work does, it does exactly — every effect below is the whole truth.'),
    ...BUILD_ORDER.map((id) => {
      const def = BUILDINGS[id];
      return h('div', { class: 'codex-entry' },
        artSlot(`building-${id}`, h('span', { class: 'codex-entry-glyph', html: iconSvg(def.icon, 22) }), { className: 'art-codex-entry', alt: def.name }),
        h('div', { class: 'codex-entry-body' },
          h('div', { class: 'codex-entry-title' }, def.name,
            h('span', { class: 'small muted' }, ` ${def.cost} gold · ${def.turns} ${def.turns === 1 ? 'season' : 'seasons'}`)),
          h('p', { class: 'small' }, def.desc + (def.requires ? ` Requires ${BUILDINGS[def.requires].name}.` : '')),
          h('p', { class: 'small italic muted' }, def.flavor),
        ),
      );
    }),
    head('The ground'),
    ...Object.values(TERRAIN).map((t) =>
      fact(t.name, `${t.income} gold base income. ${t.desc}`)),
    fact('The coast', `A province on the sea earns +${COASTAL_INCOME} gold. With Harborworks, armies may sail between your harbors — once a season, and storming a defended shore costs ${pct(COMBAT_TUNING.seaMult)}.`),
    head('Old places'),
    fact('Wayshrine', 'The province keeps +1 order each season.'),
    fact('Ember-site', 'Worth +1 Emberlight untapped, +2 more once an Ember Spire stands here.'),
    fact('Standing circle', 'Each circle you rule takes 15% off the Emberlight price of every Rite. Two circles is the most the old stones will honor.'),
    fact('Barrow', 'The old dead sleep here. Barrow-Call raises revenants from one, and certain lords have their own arrangements.'),
    fact('Forge of the old realm', 'Weapon-quests here are three times as likely to surface a blade worth naming.'),
    fact('Ruin', 'Quests lead into ruins more often than anywhere else.'),
  );
}

// ------------------------------------------------------------------- realm

function renderRealm(): HTMLElement {
  return h('div', {},
    para('A province pays what its ground is worth, times everything you have done to it — in this order: terrain base (plus coast, Granaries, Harborworks), times Market Rows and roads, times prosperity, times order, times your tithes.'),
    fact('Order pays', 'At order 100 a province pays in full. At order 0 it pays half. The scale is straight between them.'),
    fact('Tithes', `Light: ×${TAX_FX.light.mult} gold, ${TAX_FX.light.order > 0 ? '+' : ''}${TAX_FX.light.order} order each season. Fair: full gold, no drift. Harsh: ×${TAX_FX.harsh.mult} gold, ${TAX_FX.harsh.order} order each season. One setting for the whole realm.`),
    fact('Prosperity', 'Drifts toward what order deserves — high order rebuilds a plundered province, low order wears a rich one down. Ash lords recover half again as fast.'),
    head('What moves order, season by season'),
    para('Hover any province’s order number in play: every cause is itemized live. The standing causes:'),
    fact('Tithes', `light +2, harsh −3.`),
    fact('Hearthshrine', '+2, or +3 under a Flame lord.'),
    fact('Garrison', 'Up to +3, one for every two companies standing there.'),
    fact('Conquest', 'A taken province grieves for five seasons: −6 at first, easing each season.'),
    fact('A folk of another creed', '−1, always, until history forgets. History does not forget.'),
    fact('Heroes', 'Some steady the ground they stand on (+1 or more); some cursed things darken it.'),
    fact('Strain of rule', 'Hold half the realm and every province pays −2. Hold a third while leading, −1. Size is a tax.'),
    fact('Defiance', 'Trail the leader at half their size or less, and your provinces stand +2 and your musters cost 15% less. The realm loves a hard-luck banner.'),
    fact('Complacency', 'Above 78 order, −1. Content people stop watching the granary door.'),
    head('When it breaks'),
    para('Below 40 order, Osperan warns you. Below 25, rebellion brews: each season the chance grows by 1.6% per point under 25. A rising takes the angriest with it — order jumps back by 28 — and leaves an armed band on your land.'),
    para('An empty treasury is its own rebellion: run below zero and your cheapest companies disband themselves for scrap (+12 gold each), and every province loses 2 order from the shame of it.'),
    head('Upkeep'),
    para(`Every company costs its upkeep in gold each season. Every hero draws a wage: their class rate plus 2 gold per level. The Ledger (l) itemizes all of it.`),
  );
}

// ------------------------------------------------------------------- magic

function renderMagic(): HTMLElement {
  const battle = ALL_SPELLS.filter((id) => SPELLS[id].kind === 'battle');
  const realm = ALL_SPELLS.filter((id) => SPELLS[id].kind === 'realm');
  const spellCard = (id: (typeof ALL_SPELLS)[number]): HTMLElement => {
    const def = SPELLS[id];
    return h('div', { class: 'codex-entry codex-spell' },
      h('span', { class: 'codex-entry-glyph codex-spell-glyph', html: iconSvg(def.icon, 22) }),
      h('div', { class: 'codex-entry-body' },
        h('div', { class: 'codex-entry-title' }, def.name,
          h('span', { class: 'small muted' },
            ` ${def.cost > 0 ? `${def.cost} Emberlight` : 'no Emberlight'}${def.cooldown > 0 ? ` · returns after ${def.cooldown} seasons` : ''}${def.riteCost > 0 ? ` · rite ${def.riteCost}` : ''}`)),
        h('p', { class: 'small' }, def.desc),
        def.creedAffinity ? h('p', { class: 'small muted' }, `The ${CREEDS[def.creedAffinity].name} teaches this one first.`) : null,
        h('p', { class: 'small italic muted' }, def.flavor),
      ),
    );
  };
  return h('div', {},
    para('Emberlight is the realm’s magic, counted like coin. It flows every season: +1 from your own hearth, +2 from every Ember Spire (+2 more on an ember-site), +1 from an untapped ember-site, +1 per company of Adepts, +2 per Magus at your court, and whatever old relics kindle.'),
    head('Learning: the Rites'),
    para('A Rite is a working learned slowly. Start one, then pledge Emberlight season by season until the full price is paid. Up to three Rites are on offer at any time, leaning toward your creed’s teachings. Standing circles you rule cut every Rite’s price by 15% each, two circles at most.'),
    head('Battle-magic'),
    para('Battle spells cast themselves: when your army fields casters and your reserves can pay, the strongest affordable working weaves into the fight — both sides, same rule. The odds preview names the spell and its price before you commit. You never pay for magic you did not see coming.'),
    ...battle.map(spellCard),
    head('Realm workings'),
    para('These you cast yourself, from the Magic screen (m), most of them onto a province. A working on cooldown returns after the listed number of your seasons.'),
    ...realm.map(spellCard),
    fact('Discounts', 'A frugal lord or hero cuts spell prices — only the single best discount applies, they do not stack.'),
  );
}

// ------------------------------------------------------------------ heroes

function renderHeroes(): HTMLElement {
  return h('div', {},
    para(`Your court holds up to five heroes. Offers arrive on their own schedule and leave within a few seasons — a level 2 hire costs half again as much. Every hero draws a wage each season: the class rate plus 2 gold per level.`),
    ...(Object.keys(HERO_CLASSES) as HeroClass[]).map((cls) => {
      const def = HERO_CLASSES[cls];
      return h('div', { class: 'codex-entry' },
        artSlot(`class-${cls}`, h('span', { class: 'codex-entry-glyph', html: iconSvg(def.icon, 22) }), { className: 'art-codex-entry', alt: def.name }),
        h('div', { class: 'codex-entry-body' },
          h('div', { class: 'codex-entry-title' }, def.name,
            h('span', { class: 'small muted' }, ` hire ~${def.hireCost} gold · wage ${def.wage}+`)),
          h('p', { class: 'small' }, `Starts at might ${def.base.might} · lore ${def.base.lore} · guile ${def.base.guile} · leadership ${def.base.leadership}. ${classGrowthWords(cls)}`),
          h('p', { class: 'small' }, def.desc),
        ),
      );
    }),
    head('What the four stats do'),
    fact('Might', 'Fighting strength in battle, and the stat for blade-work quests.'),
    fact('Lore', 'The stat for arcane quests — the Saga leans on it hard.'),
    fact('Guile', 'The stat for quiet quests, and a friend on most others.'),
    fact('Leadership', `The army a hero leads fights +${pc(COMBAT_TUNING.leadershipPerLevel)}% per point, up to +${pc(COMBAT_TUNING.leadershipCap)}%. Only your best leader counts.`),
    head('Growing'),
    para(`Experience comes from battles and quests. Reaching the next level takes ${xpForLevel(1)} experience at level 1 and ${28} more for each level after; the cap is level ${MAX_HERO_LEVEL}. Each level grants two stat points, drawn toward the hero's calling.`),
    para(`At levels ${SKILL_LEVELS.join(', ')} the hero chooses one of two arts — permanently. The choices come from their class:`),
    ...(Object.keys(SKILLS_BY_CLASS) as HeroClass[]).map((cls) =>
      h('div', {},
        head(HERO_CLASSES[cls].name + ' arts'),
        ...SKILLS_BY_CLASS[cls].map((sid) =>
          fact(SKILLS[sid].name, SKILLS[sid].desc)),
      )),
    head('Wounds and worse'),
    para('A wounded hero mends at home, one season at a time. Death looks for heroes in lost battles, in routed armies, and at the bloody end of failed quests — a death-save (from arts or armor) subtracts straight from death’s chance. The dead return their artifacts to your vault and their names to the chronicle.'),
  );
}

// ------------------------------------------------------------------ quests

function renderQuests(): HTMLElement {
  const saga = SAGA_QUESTS.map((id) => QUESTS[id]);
  return h('div', {},
    para('The quest board turns each season. Send a ready hero; they are gone for the quest’s duration and roll when they return.'),
    fact('The roll', 'The hero’s best relevant stat, plus half their level, plus any arts and relics, plus two dice — against the quest’s difficulty. Beat it by 4 or more for a triumph (half again the reward, better artifact odds). Fail by more than 4 and it is a disaster.'),
    fact('Improvising', 'Any hero may attempt any quest. Off their specialty, they roll their best other stat at −4 — the quest card says so before you send them.'),
    fact('The three tiers', TIER_NAMES.slice(1).map((n, i) => `${n} (death on a disaster: ${pc(TIER_DEATH_RISK[i + 1])}%)`).join(' · ') + '. A setback wounds; a disaster wounds badly or kills, less a hero’s death-save, never below 5%.'),
    para('Old places pull quests toward themselves: ruins most of all, and a Forge of the old realm makes weapon-quests three times as likely to surface a named blade.'),
    head('The Grand Saga'),
    para('Five chapters, in order, for one hero-line and one realm. The Saga demands a realm behind the legend — later chapters will not open for a lord with nothing to their name.'),
    ...saga.map((q, i) => fact(
      `${['I', 'II', 'III', 'IV', 'V'][i]} — ${q.name}`,
      [
        q.desc,
        `A ${TIER_NAMES[q.tier]}-tier ${q.stat} quest, difficulty ${q.dc}${q.duration > 1 ? `, ${q.duration} seasons in the doing` : ''}.`,
        q.minLevel ? `Needs a level ${q.minLevel}+ hero.` : '',
        q.minProvinces ? `Needs ${q.minProvinces}+ provinces.` : '',
      ].filter(Boolean).join(' '),
    )),
    para('The Rekindling is held at your own seat, in the open, for three seasons — and it is a promise, not a secret. A rival who storms the seat mid-ritual breaks it. The whole realm can see the fire from where it stands.'),
    flavor('Osperan: every age gets the legend it deserves. This one, apparently, gets whoever finishes the paperwork of destiny first.'),
  );
}

// --------------------------------------------------------------- artifacts

function renderArtifacts(): HTMLElement {
  const slots: ['weapon', 'armor', 'trinket'] = ['weapon', 'armor', 'trinket'];
  const named: Record<string, string> = { weapon: 'Weapons', armor: 'Armor', trinket: 'Trinkets' };
  return h('div', {},
    para('Artifacts surface on quests, in events, and along the Saga. A new find rests in your vault until a hero takes it up at court — one weapon, one armor, one trinket each. The dead return their tools to the vault; the tools wait.'),
    ...slots.flatMap((slot) => [
      head(named[slot]),
      ...ARTIFACT_IDS.filter((id) => ARTIFACTS[id].slot === slot && !ARTIFACTS[id].shard).map((id) => {
        const def = ARTIFACTS[id];
        return h('div', { class: 'codex-entry' },
          artSlot(`artifact-${id}`, h('span', { class: 'codex-entry-glyph', html: iconSvg('vault', 20) }), { className: 'art-codex-entry', alt: def.name }),
          h('div', { class: 'codex-entry-body' },
            h('div', { class: 'codex-entry-title' }, def.name, h('span', { class: 'small muted' }, ` ${def.rarity}`)),
            h('p', { class: 'small' }, def.desc),
            h('p', { class: 'small italic muted' }, def.flavor),
          ),
        );
      }),
    ]),
    head('The sealed pages'),
    para('Three more artifacts belong to the Grand Saga. The Chronicle keeps their pages shut until a hero earns them — the Quests chapter says how.'),
  );
}

// ------------------------------------------------------------------ twelve

function renderTwelve(): HTMLElement {
  return h('div', {},
    para('Twelve claimants, and no two play alike. Each carries two abilities: a legacy that is always true of them, and a signature — one order that is theirs alone, used on a cooldown, and loud enough that the whole realm hears it. A rival’s card on the Lords screen (d) shows both, and whether their signature is ready. Nothing here is hidden from anyone.'),
    ...LORDS.map((lord) => h('div', { class: 'codex-entry' },
      artSlot(`lord-${lord.id}`, h('span', { class: 'codex-entry-glyph', html: iconSvg('crownSmall', 22) }), { className: 'art-codex-entry', alt: lord.name }),
      h('div', { class: 'codex-entry-body' },
        h('div', { class: 'codex-entry-title' }, `${lord.name}, ${lord.epithet}`,
          h('span', { class: 'small muted' }, ` ${CREEDS[lord.creed].name} · favors ${TERRAIN[lord.favoredTerrain].name}`)),
        h('p', { class: 'small' }, lord.blurb),
        h('p', { class: 'small trait-line' }, h('b', {}, `${lord.perk.label} (legacy). `), lord.perk.desc),
        h('p', { class: 'small trait-line' }, h('b', {}, `${lord.signature.name} (signature, every ${lord.signature.cooldown + 1} seasons). `),
          lord.signature.desc),
        h('p', { class: 'small italic muted' }, lord.signature.flavor),
      ),
    )),
  );
}

// ------------------------------------------------------------------- lords

function renderLords(): HTMLElement {
  return h('div', {},
    para('Every rival holds an opinion of you, from −100 to +100, and none of it is hidden: hover the number on the Lords screen (d) and every cause is itemized.'),
    head('Where an opinion comes from'),
    fact('Creed', 'Kin creeds start at +15. The Flame and the Umbra despise each other from −20. Everyone else keeps a wary −5.'),
    fact('Standing', 'Open war −20. A sworn pact +8. An alliance +18.'),
    fact('Your size', 'Hold more than 30% of the realm and every lord’s unease grows with your map.'),
    fact('Borders', 'Two or more shared borders rub, up to −8.'),
    fact('Common cause', 'Both at war with the leader? +10 — nothing warms like a shared enemy.'),
    fact('Deeds', 'Everything you do is a ledger entry with its own fading rate. Break an oath and every lord writes it down, not only the one you wronged — and that ink barely fades.'),
    head('Treaties'),
    fact('Peace', 'Ends a war. Gold can sweeten a stubborn one.'),
    fact('Pact', 'Non-aggression, sworn on an existing peace. Breaking it is a deed everyone reads.'),
    fact('Alliance', 'Grows from a pact, and it is defensive: attack one ally and the other joins the war. Allies also share their eyes — what one sees on the map, both see.'),
    fact('Calling allies to war', 'Any lord can be called into a war you already fight, with gold to steel their nerve. A refusal is remembered mildly; an answered call warmly.'),
    fact('Gifts and demands', 'Gifts warm by their weight (up to +20). Demands cost warmth whether paid or refused — pay them only when the alternative is worse.'),
    head('When one lord grows too large'),
    para('Once per game, the realm leagues: if a leader holds 40% of the map (or 34% for ten seasons running), every other lord turns cold toward them at once, and warms toward each other. It is announced in the chronicle like weather.'),
    para('What moves a rival to accept? Roughly what would move you: peace when they are losing or weary of a long war, a pact from +8 attitude, an alliance from +25. Temperament bends these — a proud lord refuses longer, a greedy one reads the gold first.'),
  );
}

// ----------------------------------------------------------------- enchant

function renderEnchant(): HTMLElement {
  const lasting = ALL_SPELLS.filter((id) => ['blessHarvest', 'sowDiscord', 'wardOfEmbers', 'veilOfNight'].includes(id));
  return h('div', {},
    para('Some workings stay on the land after the casting, and enchanted ground is marked twice over. On the map, a small wax seal sits on the province — round for a helpful working, torn for a harmful one, with a pip for each season it has left. On the province panel, every active effect is a chip naming the caster and the exact numbers. Nothing lingers invisibly, yours or anyone else’s.'),
    ...lasting.map((id) => {
      const def = SPELLS[id];
      return fact(def.name, def.desc);
    }),
    fact('Harbor quarantine', 'Not magic — misfortune. An event can close a port: −6 gold each season for 2 seasons.'),
    para('Everything else in the spellbook lands at once and is done: the full list lives in the Emberlight chapter.'),
  );
}

// ----------------------------------------------------------------- victory

function renderVictory(screen: GameScreen): HTMLElement {
  const state = screen.state;
  const nowShare = Math.round(dominionShareAt(state) * 100);
  return h('div', {},
    para('Five roads end this war, all public. Progress toward any of them is announced in the chronicle and tracked in the Ledger — nobody wins quietly at this table.'),
    fact('Conquest', 'Be the last banner standing.'),
    fact('Dominion', `Hold ${Math.round(DOMINION_SHARE * 100)}% of the realm's provinces for ${DOMINION_ROUNDS} seasons running. From season ${WEARINESS_TURN} the Chronicle wearies and the bar erodes by 0.8 points a season, down to ${Math.round(DOMINION_FLOOR * 100)}% — right now it stands at ${nowShare}%.`),
    fact('Golden Age', `Hold the realm's richest treasury at ${GOLDEN_GOLD}+ gold, with average order ${GOLDEN_ORDER}+ across at least 3 provinces, for ${GOLDEN_ROUNDS} seasons running. The war ends because you made it pointless.`),
    fact('The Legend', 'Finish all five chapters of the Grand Saga and rekindle the Ember Throne. The Quests chapter maps the road.'),
    fact('The Chronicle’s judgment', `If season ${state.victory.maxTurns} arrives with no winner, Osperan closes the book and judges the realm as it stands: 12 points per province, plus income, treasury, order, heroes of renown, artifacts recovered, and Saga chapters. The Ledger shows your standing live.`),
    h('div', { style: { padding: '0.6rem 0' } },
      h('button', { class: 'btn compact', onclick: () => openLedgerOverlay(screen) },
        'Open the Ledger — the race as it stands (l)')),
    flavor('Osperan: I do not pick winners. I merely stop writing, and see who is still standing on the last page.'),
  );
}

// -------------------------------------------------------------- marginalia

function renderMarginalia(screen: GameScreen): HTMLElement {
  const player = screen.state.players[screen.viewerId()];
  const entries = Object.entries(TEACHINGS);
  const fired = entries.filter(([key]) => player.flags[`taught:${key}`]);
  const sealed = entries.filter(([key]) => !player.flags[`taught:${key}`]);
  const titleOf = (text: string): string => {
    const m = text.match(/^Marginalia — ([^:]+):/);
    return m ? cap(m[1]) : 'A note';
  };
  return h('div', {},
    para('Osperan writes a margin note the first time a rule touches you. The notes he has written for you so far are collected here; the rest stay sealed until the war brings them up.'),
    ...(fired.length === 0
      ? [h('p', { class: 'small muted italic' }, 'No pages yet. Play a season; the realm will give him reasons.')]
      : fired.map(([, text]) => h('div', { class: 'codex-entry' },
          h('span', { class: 'codex-entry-glyph', html: iconSvg('quill', 18) }),
          h('div', { class: 'codex-entry-body' },
            h('div', { class: 'codex-entry-title' }, titleOf(text)),
            h('p', { class: 'small' }, text.replace(/^Marginalia — [^:]+:\s*/, '')),
          )))),
    sealed.length > 0 ? head('Still sealed') : null,
    ...sealed.map(([, text]) => h('p', { class: 'small muted codex-sealed' },
      h('span', { html: iconSvg('quill', 12) }), ` ${titleOf(text)} — Osperan has not written this page for you yet.`)),
  );
}

// -------------------------------------------------------------- dispatcher

const RENDERERS: Record<CodexSection, (screen: GameScreen) => HTMLElement> = {
  battle: () => renderBattle(),
  units: () => renderUnits(),
  works: () => renderWorks(),
  realm: () => renderRealm(),
  magic: () => renderMagic(),
  heroes: () => renderHeroes(),
  quests: () => renderQuests(),
  artifacts: () => renderArtifacts(),
  twelve: () => renderTwelve(),
  lords: () => renderLords(),
  enchant: () => renderEnchant(),
  victory: (screen) => renderVictory(screen),
  marginalia: (screen) => renderMarginalia(screen),
};
