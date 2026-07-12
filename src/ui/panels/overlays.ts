/**
 * The war room's drawers: Court & Heroes, Magic & Rites, Quests & Saga,
 * the Other Lords, and the Realm Ledger. Each is one modal, fully live.
 */
import { ARTIFACTS } from '../../engine/content/artifacts';
import { QUESTS, TIER_DEATH_RISK, TIER_NAMES } from '../../engine/content/quests';
import { SKILLS } from '../../engine/content/skills';
import { SPELLS } from '../../engine/content/spells';
import { CREEDS } from '../../engine/content/world';
import { LORD_BY_ID } from '../../engine/content/lords';
import { attitudeOf } from '../../engine/diplo';
import { chronicleScore, DOMINION_ROUNDS, dominionShareAt, GOLDEN_GOLD, GOLDEN_ORDER, GOLDEN_ROUNDS, WEARINESS_TURN } from '../../engine/victory';
import { incomeReport, upkeepOf, wagesOf, TAX_FX } from '../../engine/economy';
import { HERO_CLASSES, xpForLevel } from '../../engine/heroes';
import { heroDerived } from '../../engine/heroFx';
import { riteCostFor, spellCostFor } from '../../engine/magic';
import { questStat, sagaGate } from '../../engine/quests';
import { armiesOf, getStance, heroesOf, provincesOf } from '../../engine/helpers';
import type { Hero, PlayerId, SpellId } from '../../engine/types';
import { h, mount } from '../dom';
import { confirmAction, confirmCast } from '../confirm';
import { classGrowthWords, fmt, lordDisplay, signed } from '../format';
import { iconSvg } from '../icons';
import { openModal, closeAllModals, type ModalHandle } from '../modal';
import { breakdown, tip } from '../tooltip';
import { exportSave, listSlots, loadSlot, saveToSlot } from '../saves';
import { openSettingsPanel } from './settingsPanel';
import { sigilShield } from '../heraldry';
import { artSlot } from '../art';
import type { GameScreen } from '../screens/game';

// =============================================================== COURT

export function openCourtOverlay(screen: GameScreen, focusHeroId?: number): void {
  const body = h('div', { class: 'overlay-body' });
  const modal = openModal('The Court', body, { wide: true });
  const render = (): void => renderCourt(screen, body, modal, focusHeroId);
  renderCourt(screen, body, modal, focusHeroId, render);
}

function renderCourt(screen: GameScreen, body: HTMLElement, modal: ModalHandle, focusHeroId?: number, rerender?: () => void): void {
  const state = screen.state;
  const pid = screen.viewerId();
  const player = state.players[pid];
  const canAct = screen.current().kind === 'human' && state.current === pid && state.phase === 'playing';
  const refresh = rerender ?? ((): void => renderCourt(screen, body, modal, focusHeroId, rerender));

  const heroCards = heroesOf(state, pid).map((hero) => renderHeroCard(screen, hero, canAct, refresh, hero.id === focusHeroId));

  const offers = player.courtOffers.map((offer, idx) => {
    const cls = HERO_CLASSES[offer.cls];
    return h('div', { class: 'panel offer-card' },
      h('div', { class: 'side-card-head' },
        h('div', {},
          h('div', { class: 'side-card-title' }, `${offer.name}, ${offer.epithet}`),
          h('div', { class: 'small muted' }, `${cls.name}, level ${offer.level} · ${offer.expiresTurn - state.turn <= 0 ? 'leaves this season' : `leaves in ${offer.expiresTurn - state.turn} ${offer.expiresTurn - state.turn === 1 ? 'season' : 'seasons'}`}`),
        ),
        artSlot(`class-${offer.cls}`, h('span', { html: iconSvg(cls.icon, 22), style: { color: 'var(--gold)' } }), { className: 'art-class', alt: cls.name }),
      ),
      h('p', { class: 'small', style: { padding: '0 0.8rem' } },
        `Might ${offer.might} · Lore ${offer.lore} · Guile ${offer.guile} · Leadership ${offer.leadership}`),
      h('p', { class: 'small muted', style: { padding: '0 0.8rem' } },
        `${classGrowthWords(offer.cls)} Wage ${cls.wage} gold a season, rising 2 a level.`),
      h('p', { class: 'small muted italic', style: { padding: '0 0.8rem' } }, cls.desc),
      h('div', { style: { padding: '0.5rem 0.8rem' } },
        h('button', {
          class: 'btn',
          disabled: !canAct || player.gold < offer.cost,
          onclick: () => {
            if (screen.dispatch({ t: 'hireHero', offerIdx: idx })) refresh();
          },
        }, `Take their oath · ${offer.cost} gold`),
      ),
    );
  });

  const vaultItems = player.vault.map((artId) => {
    const inst = state.artifacts[artId];
    const def = inst ? ARTIFACTS[inst.defId] : null;
    if (!def) return null;
    const chip = h('span', { class: `chip chip-${def.rarity}` }, `${def.name}`);
    tip(chip, () => h('div', { class: 'tip-plain' },
      h('b', {}, def.name),
      h('p', { class: 'small' }, def.desc),
      h('p', { class: 'small italic muted' }, def.flavor),
      h('p', { class: 'small muted' }, 'Equip it from a hero\'s card.'),
    ));
    return chip;
  });

  mount(body,
    h('div', { class: 'overlay-columns' },
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, `Your heroes (${heroCards.length} of 5)`),
        heroCards.length === 0 ? h('p', { class: 'muted italic small' }, 'No names in your margin yet. Heroes fill pages, or graves.') : null,
        ...heroCards,
      ),
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'Petitioners'),
        offers.length === 0 ? h('p', { class: 'muted italic small' }, 'The antechamber stands empty this season.') : null,
        ...offers,
        h('h3', { class: 'settings-head' }, 'The vault'),
        vaultItems.length === 0
          ? h('p', { class: 'muted italic small' }, 'Bare shelves. Quests fill them.')
          : h('div', { class: 'chip-row', style: { padding: '0 0.2rem' } }, ...vaultItems),
      ),
    ),
  );
}

function renderHeroCard(screen: GameScreen, hero: Hero, canAct: boolean, refresh: () => void, focused: boolean): HTMLElement {
  const state = screen.state;
  const d = heroDerived(state, hero);
  const cls = HERO_CLASSES[hero.cls];
  const player = state.players[hero.owner];

  const statusLine = hero.status === 'questing'
    ? `Questing: ${QUESTS[hero.questId ?? '']?.name ?? 'away'}`
    : hero.status === 'wounded'
      ? `Wounded: ${hero.woundedTurns} ${hero.woundedTurns === 1 ? 'season' : 'seasons'} to mend`
      : hero.armyId !== null
        ? 'With the army'
        : 'At court';

  // the whole art is printed on the face and the choice asks to be sealed:
  // a crossroads is walked once, and phones deserve better than a stray tap
  const skillChoice = hero.levelChoices.length > 0 && canAct
    ? h('div', { class: 'skill-choice' },
        h('div', { class: 'small-caps', style: { color: 'var(--gold-bright)' } }, 'A crossroads. Choose one art:'),
        ...hero.levelChoices.map((skillId) => {
          const skill = SKILLS[skillId];
          if (!skill) return null;
          return h('button', {
            class: 'btn compact skill-pick', style: { margin: '0.2rem 0.3rem 0 0' },
            onclick: () => {
              confirmAction(screen, {
                title: `Learn ${skill.name}?`,
                body: [
                  h('p', { class: 'small' }, skill.desc),
                  h('p', { class: 'small muted' }, 'A crossroads is walked once: the other art closes for good.'),
                  h('p', { class: 'small italic muted' }, skill.flavor),
                ],
                action: { t: 'chooseSkill', heroId: hero.id, skill: skillId },
                confirmLabel: 'Learn it',
                cancelLabel: 'Consider again',
                onDone: refresh,
              });
            },
          },
            h('b', {}, skill.name),
            h('span', { class: 'small muted skill-pick-desc' }, skill.desc),
          );
        }),
      )
    : null;

  const slots = (['weapon', 'armor', 'trinket'] as const).map((slot) => {
    const artId = hero.artifacts[slot];
    const inst = artId !== null ? state.artifacts[artId] : null;
    const def = inst ? ARTIFACTS[inst.defId] : null;
    const options = player.vault
      .map((id) => ({ id, def: ARTIFACTS[state.artifacts[id]?.defId ?? ''] }))
      .filter((o) => o.def && o.def.slot === slot);
    const select = canAct && hero.status !== 'questing' && (options.length > 0 || def)
      ? h('select', {
          class: 'input compact', 'aria-label': `${hero.name}: ${slot}`,
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === 'none') {
              screen.dispatch({ t: 'unequip', heroId: hero.id, slot });
            } else {
              screen.dispatch({ t: 'equip', heroId: hero.id, artifactId: parseInt(v, 10), slot });
            }
            refresh();
          },
        },
          h('option', { value: 'none', selected: !def }, `· ${slot} ·`),
          def && artId !== null ? h('option', { value: String(artId), selected: true }, def.name) : null,
          ...options.map((o) => h('option', { value: String(o.id) }, o.def.name)),
        )
      : h('span', { class: 'small muted' }, def ? def.name : `· ${slot} ·`);
    return h('div', { class: 'slot-line' }, h('span', { class: 'small-caps small' }, slot), select);
  });

  return h('div', { class: `panel side-card ${focused ? 'army-selected' : ''}` },
    h('div', { class: 'side-card-head' },
      h('div', {},
        h('div', { class: 'side-card-title' }, `${hero.name}, ${hero.epithet}`),
        h('div', { class: 'small muted' }, `${cls.name} · level ${hero.level} · ${hero.xp}/${xpForLevel(hero.level)} xp · ${statusLine}`),
      ),
      h('span', { html: iconSvg(cls.icon, 22), style: { color: 'var(--gold)' } }),
    ),
    h('p', { class: 'small', style: { padding: '0 0.8rem' } },
      `Might ${d.might} · Lore ${d.lore} · Guile ${d.guile} · Leadership ${d.leadership}${d.deathSave > 0 ? ` · wards death ${Math.round(d.deathSave * 100)}%` : ''}`),
    hero.skills.length > 0
      ? h('div', { class: 'chip-row', style: { padding: '0 0.6rem' } }, ...hero.skills.map((s) => {
          const skill = SKILLS[s];
          const chip = h('span', { class: 'chip' }, skill?.name ?? s);
          if (skill) tip(chip, () => h('div', { class: 'tip-plain' }, h('b', {}, skill.name), h('p', { class: 'small' }, skill.desc)));
          return chip;
        }))
      : null,
    skillChoice,
    h('div', { style: { padding: '0.2rem 0.8rem 0.6rem' } }, ...slots),
    hero.deeds.length > 0
      ? h('p', { class: 'small muted italic', style: { padding: '0 0.8rem 0.6rem' } }, `Deeds: ${hero.deeds.slice(-3).join(' · ')}`)
      : null,
    canAct && hero.status === 'ready'
      ? h('div', { style: { padding: '0 0.8rem 0.8rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' } },
          hero.armyId === null
            ? h('button', {
                class: 'btn compact',
                onclick: () => {
                  const armies = armiesOf(state, hero.owner).filter((a) => a.heroIds.length < 3);
                  const target = armies.find((a) => state.provinces[a.province].owner === hero.owner || a.province === hero.province);
                  if (target && screen.dispatch({ t: 'attachHero', heroId: hero.id, armyId: target.id })) refresh();
                  else screen.toast('No banner within safe reach. Move an army into your own lands, or to the hero.', 'info');
                },
              }, 'Join the army')
            : h('button', {
                class: 'btn compact',
                onclick: () => {
                  if (screen.dispatch({ t: 'attachHero', heroId: hero.id, armyId: null })) refresh();
                },
              }, 'Recall to court'),
          h('button', {
            class: 'btn btn-quiet compact',
            onclick: () => {
              const wage = HERO_CLASSES[hero.cls].wage + Math.floor(hero.level * 2);
              const carries = (['weapon', 'armor', 'trinket'] as const).some((s) => hero.artifacts[s] !== null);
              confirmAction(screen, {
                title: `Release ${hero.name}?`,
                body: [
                  h('p', { class: 'small' },
                    `${hero.name}, ${hero.epithet} leaves your service for good. Their wage of ${wage} gold each season ends.`),
                  carries ? h('p', { class: 'small muted' }, 'What they carry returns to your vault.') : null,
                ],
                action: { t: 'dismissHero', heroId: hero.id },
                confirmLabel: 'Release them',
                cancelLabel: 'Keep them',
                onDone: refresh,
              });
            },
          }, 'Release from service'),
        )
      : null,
  );
}

// =============================================================== MAGIC

export function openMagicOverlay(screen: GameScreen): void {
  const body = h('div', { class: 'overlay-body' });
  openModal('Emberlight & the Rites', body, { wide: true });
  renderMagic(screen, body);
}

function renderMagic(screen: GameScreen, body: HTMLElement): void {
  const state = screen.state;
  const pid = screen.viewerId();
  const player = state.players[pid];
  const canAct = screen.current().kind === 'human' && state.current === pid && state.phase === 'playing';
  const refresh = (): void => renderMagic(screen, body);

  const knownSpells = player.spells.map((id) => {
    const def = SPELLS[id];
    const cost = spellCostFor(state, pid, id);
    const cd = player.spellCooldowns[id] ?? 0;
    const canCast = canAct && def.kind === 'realm' && cd === 0 && player.emberlight >= cost;
    const card = h('div', { class: 'panel spell-card' },
      h('div', { class: 'side-card-head' },
        h('div', {},
          h('div', { class: 'side-card-title' }, def.name),
          h('div', { class: 'small muted' },
            `${def.kind === 'battle' ? 'Battle-magic · woven automatically' : 'Realm working'} · ${cost} Emberlight${def.cooldown > 0 ? ` · every ${def.cooldown + 1} seasons` : ''}`),
        ),
        h('span', { html: iconSvg(def.icon, 20), style: { color: 'var(--ember-bright)' } }),
      ),
      h('p', { class: 'small', style: { padding: '0 0.8rem' } }, def.desc),
      h('p', { class: 'small italic muted', style: { padding: '0 0.8rem 0.6rem' } }, def.flavor),
      def.kind === 'realm'
        ? h('div', { style: { padding: '0 0.8rem 0.8rem' } },
            cd > 0
              ? h('span', { class: 'chip' }, `Gathers for ${cd} more ${cd === 1 ? 'season' : 'seasons'}`)
              : h('button', {
                  class: 'btn compact',
                  disabled: !canCast,
                  onclick: () => {
                    beginTargetedCast(screen, id, refresh);
                  },
                }, def.target === 'none' ? 'Cast' : 'Cast: choose a province'),
          )
        : null,
    );
    return card;
  });

  const rite = player.rite;
  const riteBlock = rite
    ? (() => {
        const def = SPELLS[rite.spellId];
        const pct = Math.round((rite.paid / rite.cost) * 100);
        return h('div', { class: 'panel spell-card' },
          h('div', { class: 'side-card-head' },
            h('div', {},
              h('div', { class: 'side-card-title' }, `Rite of ${def.name}`),
              h('div', { class: 'small muted' }, `${rite.paid} of ${rite.cost} Emberlight pledged`),
            ),
          ),
          h('div', { class: 'odds-meter', style: { margin: '0 0.8rem' } }, h('div', { class: 'odds-fill', style: { width: `${pct}%` } })),
          h('div', { style: { padding: '0.6rem 0.8rem', display: 'flex', gap: '0.4rem' } },
            h('button', {
              class: 'btn compact', disabled: !canAct || player.emberlight < 5,
              onclick: () => {
                if (screen.dispatch({ t: 'pledgeEmberlight', amount: 5 })) refresh();
              },
            }, 'Pledge 5'),
            h('button', {
              class: 'btn compact', disabled: !canAct || player.emberlight < 1,
              onclick: () => {
                if (screen.dispatch({ t: 'pledgeEmberlight', amount: player.emberlight })) refresh();
              },
            }, `Pledge all (${fmt(player.emberlight)})`),
          ),
        );
      })()
    : h('div', { class: 'panel spell-card' },
        h('div', { class: 'panel-title' }, 'Begin a rite'),
        player.riteOffers.length === 0
          ? h('p', { class: 'small muted italic', style: { padding: '0.8rem' } }, 'No undiscovered workings remain to begin. New threads surface in time, or on quests.')
          : h('div', { style: { padding: '0.6rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' } },
              ...player.riteOffers.map((id) => {
                const def = SPELLS[id];
                const cost = riteCostFor(state, pid, id);
                const btn = h('button', {
                  class: 'btn',
                  disabled: !canAct,
                  style: { justifyContent: 'space-between' },
                  onclick: () => {
                    confirmAction(screen, {
                      title: `Begin the rite of ${def.name}?`,
                      body: [
                        h('p', { class: 'small' }, def.desc),
                        h('p', { class: 'small muted' },
                          `The rite asks ${cost} Emberlight in all, pledged season by season. When the last is paid, the working is yours for good.`),
                        h('p', { class: 'small italic muted' }, def.flavor),
                      ],
                      action: { t: 'startRite', spellId: id },
                      confirmLabel: 'Begin the rite',
                      onDone: refresh,
                    });
                  },
                }, h('span', { html: `${iconSvg(def.icon, 16)} ${def.name}` }), h('span', { class: 'small muted' }, `${cost} Emberlight`));
                tip(btn, () => h('div', { class: 'tip-plain' },
                  h('b', {}, `${def.name} (${def.kind === 'battle' ? 'battle' : 'realm'})`),
                  h('p', { class: 'small' }, def.desc),
                  h('p', { class: 'small italic muted' }, def.flavor)));
                return btn;
              }),
            ),
      );

  mount(body,
    h('p', { class: 'small muted', style: { margin: '0 0 0.6rem' } },
      `Emberlight in hand: ${fmt(player.emberlight)}. Battle spells weave themselves when your armies field casters. The odds preview always names them and their price.`),
    h('div', { class: 'overlay-columns' },
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'Workings known'),
        knownSpells.length === 0 ? h('p', { class: 'muted italic small' }, 'None yet. Rites, quests, and standing stones teach them.') : null,
        ...knownSpells,
      ),
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'The Rites'),
        riteBlock,
      ),
    ),
  );
}

/** Realm spells with a province target: close the modal, arm a map click.
 * Untargeted workings confirm right here; targeted ones confirm at the
 * chosen province (see onProvinceClick). */
function beginTargetedCast(screen: GameScreen, spellId: SpellId, onDone?: () => void): void {
  const def = SPELLS[spellId];
  if (def.target === 'none') {
    confirmCast(screen, spellId, undefined, { onDone });
    return;
  }
  closeAllModals();
  screen.armSpellTargeting(spellId);
}

// =============================================================== QUESTS

export function openQuestsOverlay(screen: GameScreen): void {
  const body = h('div', { class: 'overlay-body' });
  openModal('Quests & the Grand Saga', body, { wide: true });
  renderQuests(screen, body);
}

function renderQuests(screen: GameScreen, body: HTMLElement): void {
  const state = screen.state;
  const pid = screen.viewerId();
  const player = state.players[pid];
  const canAct = screen.current().kind === 'human' && state.current === pid && state.phase === 'playing';
  const refresh = (): void => renderQuests(screen, body);
  const readyHeroes = heroesOf(state, pid).filter((hh) => hh.status === 'ready');

  const heroPicker = (defId: string, province: number): HTMLElement => {
    const def = QUESTS[defId];
    const eligible = readyHeroes.filter((hh) => !def.minLevel || hh.level >= def.minLevel);
    if (!canAct) return h('span', { class: 'small muted' }, 'Not your season.');
    if (eligible.length === 0) return h('span', { class: 'small muted' }, def.minLevel ? `Needs a ready hero of level ${def.minLevel}+.` : 'No hero is at liberty.');
    return h('div', { style: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' } },
      ...eligible.map((hh) => {
        const d = heroDerived(state, hh);
        const rough = questStat(d, def.stat) + hh.level * 0.5 + d.questAdd + 4.5 - def.dc;
        const feel = rough >= 4 ? 'near-certain' : rough >= 1.5 ? 'favored' : rough >= -1 ? 'chancy' : 'grim';
        const mathLine = questStat(d, def.stat) > d[def.stat]
          ? `${hh.name} improvises: best other stat −4 (${questStat(d, def.stat)}) beats their ${def.stat} ${d[def.stat]}, plus level ${hh.level}, against difficulty ${def.dc}.`
          : `${hh.name}'s ${def.stat} ${d[def.stat]} + level ${hh.level} against difficulty ${def.dc}.`;
        const deathRisk = Math.max(0.05, TIER_DEATH_RISK[def.tier] - d.deathSave);
        const btn = h('button', {
          class: 'btn compact',
          onclick: () => {
            confirmAction(screen, {
              title: `Send ${hh.name}?`,
              body: [
                h('p', { class: 'small' },
                  `${def.name}, at ${state.provinces[province].name}: away ${def.duration} ${def.duration === 1 ? 'season' : 'seasons'}.`),
                h('p', { class: 'small' }, `${mathLine} The odds read ${feel}.`),
                h('p', { class: 'small muted' },
                  `A setback wounds them. A disaster wounds deeper, and about ${Math.round(deathRisk * 100)} times in 100 it kills.`),
              ],
              action: { t: 'startQuest', heroId: hh.id, questDefId: defId, province },
              confirmLabel: 'Send them',
              cancelLabel: 'Not yet',
              onDone: refresh,
            });
          },
        }, `${hh.name} (${feel})`);
        tip(btn, mathLine);
        return btn;
      }),
    );
  };

  const offers = (state.questOffers[pid] ?? []).map((offer) => {
    const def = QUESTS[offer.defId];
    if (!def) return null;
    const p = state.provinces[offer.province];
    return h('div', { class: 'panel quest-card' },
      h('div', { class: 'side-card-head' },
        h('div', {},
          h('div', { class: 'side-card-title' }, def.name),
          h('div', { class: 'small muted' },
            `${TIER_NAMES[def.tier]} tier · ${def.stat} vs ${def.dc} · ${def.duration} seasons · at ${p.name} · offer ends season ${offer.expiresTurn}`),
        ),
        h('span', { html: iconSvg('quest', 20), style: { color: 'var(--gold)' } }),
      ),
      h('p', { class: 'small', style: { padding: '0 0.8rem' } }, def.desc),
      h('div', { style: { padding: '0.4rem 0.8rem 0.8rem' } }, heroPicker(def.id, offer.province)),
    );
  });

  const gate = sagaGate(state, pid);
  const saga = gate.available;
  const sagaBlock = h('div', { class: 'panel quest-card quest-saga' },
    h('div', { class: 'side-card-head' },
      h('div', {},
        h('div', { class: 'side-card-title' }, 'The Grand Saga of the Rekindling'),
        h('div', { class: 'small muted' }, `${player.sagaChapter} of 5 chapters written in your name`),
      ),
      h('span', { html: iconSvg('crownSmall', 22), style: { color: 'var(--ember-bright)' } }),
    ),
    h('div', { class: 'saga-track' },
      ...[1, 2, 3, 4, 5].map((c) => h('span', {
        class: `saga-pip ${player.sagaChapter >= c ? 'saga-done' : ''}`,
        'aria-label': `Chapter ${c}${player.sagaChapter >= c ? ', complete' : ''}`,
      }, String(c))),
    ),
    saga
      ? h('div', {},
          h('p', { class: 'small', style: { padding: '0 0.8rem' } }, h('b', {}, saga.def.name), `: ${saga.def.desc}`),
          h('p', { class: 'small muted', style: { padding: '0 0.8rem' } },
            `${saga.def.stat} vs ${saga.def.dc} · ${saga.def.duration} seasons · hero level ${saga.def.minLevel}+ · at ${saga.venues.map((v) => state.provinces[v].name).join(' or ')}`),
          h('div', { style: { padding: '0.4rem 0.8rem 0.8rem' } }, heroPicker(saga.def.id, saga.venues[0])),
        )
      : h('p', { class: 'small muted italic', style: { padding: '0 0.8rem 0.8rem' } },
          player.sagaChapter >= 5
            ? 'The Saga is complete. The realm is yours by legend.'
            : gate.reason ?? 'The next chapter waits on the last, or on a site your realm can reach.'),
  );

  const active = state.activeQuests.filter((q) => q.owner === pid).map((q) => {
    const def = QUESTS[q.defId];
    const hero = state.heroes[q.heroId];
    return h('p', { class: 'small', style: { padding: '0.2rem 0.4rem', display: 'flex', gap: '0.35rem', alignItems: 'center' } },
      h('span', { html: iconSvg('hourglass', 12) }),
      `${hero?.name ?? 'A hero'}: ${def?.name ?? q.defId}, returns season ${q.endTurn}.`);
  });

  mount(body,
    h('div', { class: 'overlay-columns' },
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'The board'),
        offers.length === 0 ? h('p', { class: 'muted italic small' }, 'The board is bare; new undertakings surface each season.') : null,
        ...offers,
        active.length > 0 ? h('h3', { class: 'settings-head' }, 'In the field') : null,
        ...active,
      ),
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'The Legend path'),
        sagaBlock,
      ),
    ),
  );
}

// ============================================================ DIPLOMACY

export function openDiplomacyOverlay(screen: GameScreen, focusPlayer?: PlayerId): void {
  const body = h('div', { class: 'overlay-body' });
  openModal('The Other Lords', body, { wide: true });
  renderDiplomacy(screen, body, focusPlayer);
}

function renderDiplomacy(screen: GameScreen, body: HTMLElement, focusPlayer?: PlayerId): void {
  const state = screen.state;
  const pid = screen.viewerId();
  const player = state.players[pid];
  const canAct = screen.current().kind === 'human' && state.current === pid && state.phase === 'playing';
  const refresh = (): void => renderDiplomacy(screen, body, focusPlayer);

  const proposalCards = state.proposals.filter((pr) => pr.to === pid).map((pr) => {
    const from = lordDisplay(state, pr.from);
    return h('div', { class: 'panel side-card', style: { borderColor: 'var(--gold)' } },
      h('div', { class: 'side-card-head' },
        h('div', {},
          h('div', { class: 'side-card-title' }, `An envoy from ${from.name}`),
          h('div', { class: 'small muted' }, pr.note),
        ),
      ),
      canAct
        ? h('div', { style: { padding: '0.4rem 0.8rem 0.8rem', display: 'flex', gap: '0.5rem' } },
            h('button', {
              class: 'btn btn-seal compact',
              onclick: () => {
                if (screen.dispatch({ t: 'respond', proposalId: pr.id, accept: true })) refresh();
              },
            }, 'Accept'),
            h('button', {
              class: 'btn compact',
              onclick: () => {
                if (screen.dispatch({ t: 'respond', proposalId: pr.id, accept: false })) refresh();
              },
            }, 'Refuse'),
          )
        : h('p', { class: 'small muted', style: { padding: '0 0.8rem 0.8rem' } }, 'Answer when your season comes.'),
    );
  });

  const rivals = state.players.filter((o) => o.id !== pid).map((other) => {
    const lord = LORD_BY_ID[other.lordId];
    const stance = getStance(state, pid, other.id);
    const attitude = attitudeOf(state, other.id, pid); // how THEY see US (the useful direction)
    const myView = attitudeOf(state, pid, other.id);
    void myView;
    const attEl = h('span', {
      class: `attitude ${attitude.total > 15 ? 'pos' : attitude.total < -15 ? 'neg' : ''}`,
    }, `${attitude.total > 0 ? '+' : ''}${attitude.total}`);
    tip(attEl, () => breakdown(`How ${lord.name} regards you`, attitude.lines, `${attitude.total > 0 ? 'Warm' : attitude.total < -20 ? 'Hostile' : 'Wary'} (${attitude.total})`));

    const stanceChip = h('span', { class: `chip stance-${stance}` },
      stance === 'war' ? 'AT WAR' : stance === 'pact' ? 'Pact' : stance === 'alliance' ? 'Alliance' : 'Peace');

    const actions: HTMLElement[] = [];
    if (canAct && other.alive) {
      // the viewer's rival-aimed signature, right where the rival is
      const myLord = LORD_BY_ID[player.lordId];
      if (myLord.signature.target === 'rival' && (player.signatureCooldownLeft ?? 0) === 0) {
        const sigBtn = h('button', {
          class: 'btn btn-seal compact',
          onclick: () => {
            if (screen.dispatch({ t: 'signature', targetPlayer: other.id })) refresh();
          },
        }, `${myLord.signature.name}`);
        tip(sigBtn, () => h('div', { class: 'tip-plain' },
          h('b', {}, `${myLord.signature.name} · your signature, aimed here`),
          h('p', { class: 'small' }, myLord.signature.desc),
        ));
        actions.push(sigBtn);
      }
      if (stance === 'war') {
        actions.push(h('button', { class: 'btn compact', onclick: () => openGoldPrompt(screen, 'Sweeten the peace with gold?', (gold) => {
          if (screen.dispatch({ t: 'diplomacy', kind: 'offerPeace', target: other.id, gold })) refresh();
        }) }, 'Offer peace'));
      } else {
        actions.push(h('button', {
          class: 'btn compact',
          onclick: () => {
            if (screen.dispatch({ t: 'diplomacy', kind: 'declareWar', target: other.id })) refresh();
          },
        }, stance === 'pact' || stance === 'alliance' ? 'Break faith: war' : 'Declare war'));
        if (stance === 'peace') {
          actions.push(h('button', {
            class: 'btn compact',
            onclick: () => {
              if (screen.dispatch({ t: 'diplomacy', kind: 'offerPact', target: other.id })) refresh();
            },
          }, 'Propose pact'));
        }
        if (stance === 'pact') {
          actions.push(h('button', {
            class: 'btn compact',
            onclick: () => {
              if (screen.dispatch({ t: 'diplomacy', kind: 'offerAlliance', target: other.id })) refresh();
            },
          }, 'Propose alliance'));
          actions.push(h('button', {
            class: 'btn btn-quiet compact',
            onclick: () => {
              if (screen.dispatch({ t: 'diplomacy', kind: 'breakPact', target: other.id })) refresh();
            },
          }, 'Dissolve pact'));
        }
        actions.push(h('button', { class: 'btn compact', onclick: () => openGoldPrompt(screen, 'How much gold to send?', (gold) => {
          if (gold > 0 && screen.dispatch({ t: 'diplomacy', kind: 'gift', target: other.id, gold })) refresh();
        }) }, 'Send a gift'));
        actions.push(h('button', { class: 'btn compact', onclick: () => openGoldPrompt(screen, 'How much gold to demand?', (gold) => {
          if (gold > 0 && screen.dispatch({ t: 'diplomacy', kind: 'demand', target: other.id, gold })) refresh();
        }) }, 'Demand tribute'));
        // call this lord into one of your wars (if they aren't already in it)
        for (const enemy of state.players) {
          if (!enemy.alive || enemy.id === player.id || enemy.id === other.id) continue;
          if (getStance(state, player.id, enemy.id) !== 'war') continue;
          if (getStance(state, other.id, enemy.id) === 'war') continue;
          const enemyLord = LORD_BY_ID[enemy.lordId];
          const callBtn = h('button', { class: 'btn compact', onclick: () => openGoldPrompt(screen, `Gold for ${lord.name}'s war-chest? (0 is allowed)`, (gold) => {
            if (screen.dispatch({ t: 'diplomacy', kind: 'joinWar', target: other.id, against: enemy.id, gold })) refresh();
          }) }, `Call to war vs ${enemyLord.name.split(' ')[0]}`);
          tip(callBtn, `Ask ${lord.name} to enter your war against ${enemyLord.name}. Warm relations, shared enemies, and gold all help. A refusal is remembered, briefly.`);
          actions.push(callBtn);
        }
      }
    }

    return h('div', { class: `panel side-card ${focusPlayer === other.id ? 'army-selected' : ''}` },
      h('div', { class: 'side-card-head' },
        artSlot(`lord-${lord.id}`, sigilShield(lord.id, 34), { className: 'art-portrait', alt: `${lord.name}` }),
        h('div', { style: { flex: '1', minWidth: '0' } },
          h('div', { class: 'side-card-title' },
            `${lord.name}, ${lord.epithet}`,
            other.alive ? '' : ' †'),
          h('div', { class: 'small muted' },
            `${CREEDS[lord.creed].name} · ${provincesOf(state, other.id).length} provinces · ${other.kind === 'ai' ? other.handicap.label : 'Mortal hands'}`),
        ),
        h('div', { style: { display: 'flex', gap: '0.4rem', alignItems: 'center' } }, stanceChip, other.alive ? attEl : null),
      ),
      h('p', { class: 'small italic muted', style: { padding: '0 0.8rem' } }, lord.blurb),
      h('p', { class: 'small', style: { padding: '0 0.8rem', margin: '0.15rem 0' } },
        h('b', { style: { color: 'var(--gold)' } }, `${lord.perk.label}. `), lord.perk.desc),
      h('p', { class: 'small', style: { padding: '0 0.8rem', margin: '0.15rem 0' } },
        h('b', { style: { color: 'var(--ember-bright)' } }, `${lord.signature.name}. `), lord.signature.desc,
        other.alive && (other.signatureCooldownLeft ?? 0) > 0
          ? h('span', { class: 'muted' }, ` (returns in ${other.signatureCooldownLeft})`)
          : null),
      h('p', { class: 'small lord-intro-quote', style: { padding: '0 0.8rem', margin: '0.2rem 0 0.4rem' } },
        `“${lord.lines.intro}”`),
      other.alive && actions.length > 0
        ? h('div', { style: { padding: '0.4rem 0.8rem 0.8rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' } }, ...actions)
        : null,
    );
  });

  // the comparison table: every living rival in one glance, one row each:
  // only what the Ledger and the cards already tell (fog reveals nothing new
  // here), with the full card below as the dossier
  const living = state.players.filter((o) => o.id !== pid && o.alive);
  const compareRows = living.map((other) => {
    const lord = LORD_BY_ID[other.lordId];
    const stance = getStance(state, pid, other.id);
    const att = attitudeOf(state, other.id, pid);
    const cd = other.signatureCooldownLeft ?? 0;
    return h('tr', {
      class: 'rival-row',
      tabindex: '0',
      role: 'button',
      'aria-label': `${lord.name}, the full dossier below`,
      onclick: () => renderDiplomacy(screen, body, other.id),
      onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderDiplomacy(screen, body, other.id); } },
    },
      h('td', {}, h('span', { class: 'lord-swatch', style: { background: lord.color, marginRight: '0.35em' } }), lord.name.split(' ').slice(-1)[0]),
      h('td', {}, h('span', { class: `chip stance-${stance}` }, stance === 'war' ? 'WAR' : stance === 'pact' ? 'Pact' : stance === 'alliance' ? 'Allied' : 'Peace')),
      h('td', { class: att.total > 15 ? 'pos' : att.total < -15 ? 'neg' : '' }, `${att.total > 0 ? '+' : ''}${att.total}`),
      h('td', {}, String(provincesOf(state, other.id).length)),
      h('td', {}, `${other.sagaChapter}/5`),
      h('td', { class: 'small' }, cd === 0 ? 'ready' : `${cd} to go`),
    );
  });
  const compareTable = living.length > 1
    ? h('div', { class: 'rival-table-wrap' },
        h('table', { class: 'rival-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Lord'), h('th', {}, 'Stance'), h('th', {}, 'Regard'),
            h('th', {}, 'Lands'), h('th', {}, 'Saga'), h('th', {}, 'Signature'),
          )),
          h('tbody', {}, ...compareRows),
        ),
      )
    : null;

  mount(body,
    proposalCards.length > 0 ? h('h3', { class: 'settings-head' }, 'Envoys waiting') : null,
    ...proposalCards,
    compareTable ? h('h3', { class: 'settings-head' }, 'The table, at a glance') : null,
    compareTable,
    h('h3', { class: 'settings-head' }, 'The claimants'),
    ...rivals,
    h('p', { class: 'small muted italic' }, `Your creed: ${CREEDS[LORD_BY_ID[player.lordId].creed].name}. ${CREEDS[LORD_BY_ID[player.lordId].creed].tagline}`),
  );
  if (focusPlayer !== undefined) {
    body.querySelector('.army-selected')?.scrollIntoView({ block: 'start' });
  }
}

function openGoldPrompt(screen: GameScreen, title: string, onConfirm: (gold: number) => void): void {
  const input = h('input', { class: 'input', type: 'number', min: '0', step: '10', value: '50', 'aria-label': 'Gold amount', style: { width: '10ch' } }) as HTMLInputElement;
  const content = h('div', { style: { padding: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'center' } },
    input,
    h('button', {
      class: 'btn btn-seal',
      onclick: () => {
        const gold = Math.max(0, parseInt(input.value, 10) || 0);
        modal.close();
        onConfirm(gold);
      },
    }, 'Send word'),
  );
  const modal = openModal(title, content);
  void screen;
}

// =============================================================== LEDGER

export function openLedgerOverlay(screen: GameScreen): void {
  screen.ledgerSeen = true;
  const body = h('div', { class: 'overlay-body' });
  openModal('The Realm Ledger', body, { wide: true });
  renderLedger(screen, body);
  screen.guide?.onUpdate(screen);
}

function renderLedger(screen: GameScreen, body: HTMLElement): void {
  const state = screen.state;
  const pid = screen.viewerId();
  const player = state.players[pid];
  const canAct = screen.current().kind === 'human' && state.current === pid && state.phase === 'playing';
  const report = incomeReport(state, pid);
  const upkeep = upkeepOf(state, pid);
  const wages = wagesOf(state, pid);
  const refresh = (): void => renderLedger(screen, body);

  const taxRow = h('div', { class: 'stance-row', style: { padding: '0 0.8rem 0.8rem' } },
    ...(['light', 'fair', 'harsh'] as const).map((t) => {
      const btn = h('button', {
        class: `stance-btn ${player.tax === t ? 'active' : ''}`,
        disabled: !canAct,
        onclick: () => {
          if (screen.dispatch({ t: 'setTax', level: t })) refresh();
        },
      }, t[0].toUpperCase() + t.slice(1));
      tip(btn, TAX_FX[t].label);
      return btn;
    }),
  );

  // victory progress
  const total = state.provinces.length;
  const rows = state.players.filter((p) => p.alive).map((p) => {
    const lord = LORD_BY_ID[p.lordId];
    const share = provincesOf(state, p.id).length / total;
    const domStreak = state.victory.dominionStreak[p.id] ?? 0;
    const goldStreak = state.victory.goldenStreak[p.id] ?? 0;
    const score = chronicleScore(state, p.id);
    const scoreEl = h('td', {}, String(score.total));
    tip(scoreEl, () => breakdown(`${lord.name} · chronicle standing`, score.lines, `${score.total} points if the Chronicle closed today`));
    return h('tr', { class: p.id === pid ? 'ledger-you' : '' },
      h('td', {}, h('span', { class: 'lord-swatch', style: { background: lord.color, marginRight: '0.4em' } }), lord.name),
      h('td', {}, `${provincesOf(state, p.id).length} (${Math.round(share * 100)}%)`),
      h('td', {}, domStreak > 0 ? `${domStreak}/${DOMINION_ROUNDS} ⚠` : '·'),
      h('td', {}, goldStreak > 0 ? `${goldStreak}/${GOLDEN_ROUNDS} ⚠` : '·'),
      h('td', {}, `${p.sagaChapter}/5`),
      scoreEl,
    );
  });

  mount(body,
    h('div', { class: 'overlay-columns' },
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'Coin'),
        h('div', { class: 'panel', style: { padding: '0.6rem' } },
          breakdown('Income, each season', report.lines.filter((l) => l.amount >= 0 || l.label.includes('Handicap')), `Gross ${fmt(report.gold)}`),
          breakdown('Upkeep', upkeep.lines, `−${fmt(upkeep.total)} for soldiers`),
          breakdown('Wages', wages.lines, `−${fmt(wages.total)} for heroes`),
          h('p', { class: 'tip-total' }, `Net: ${signed(report.net)} gold each season`),
        ),
        h('h3', { class: 'settings-head' }, 'Tithes'),
        h('div', { class: 'panel' }, h('p', { class: 'small muted', style: { padding: '0.6rem 0.8rem 0' } }, TAX_FX[player.tax].label), taxRow),
      ),
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'The race for the throne'),
        h('div', { class: 'panel', style: { padding: '0.6rem', overflowX: 'auto' } },
          h('table', { class: 'ledger-table' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Claimant'), h('th', {}, 'Provinces'),
              h('th', {}, 'Dominion'), h('th', {}, 'Golden Age'), h('th', {}, 'Saga'), h('th', {}, 'Standing'))),
            h('tbody', {}, ...rows),
          ),
          h('p', { class: 'small muted', style: { marginTop: '0.5rem' } },
            `Dominion: hold ${Math.round(dominionShareAt(state) * 100)}%${state.turn > WEARINESS_TURN ? ' (the Chronicle wearies: it shrinks each season)' : ''} for ${DOMINION_ROUNDS} seasons. Golden Age: richest treasury over ${GOLDEN_GOLD} with average order ${GOLDEN_ORDER}+, ${GOLDEN_ROUNDS} seasons running. The Chronicle closes at season ${state.victory.maxTurns}.`),
        ),
      ),
    ),
  );
}

// ================================================================= MENU

export function openMenuOverlay(screen: GameScreen): void {
  const state = screen.state;
  const content = h('div', { style: { padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '280px' } },
    h('button', {
      class: 'btn',
      onclick: () => {
        const slot = nextFreeSlot();
        if (slot === null) {
          screen.toast('All five shelf slots hold chronicles. Burn one from the title screen first.', 'danger');
          return;
        }
        saveToSlot(state, slot);
        screen.toast('The chronicle is shelved.', 'info');
      },
    }, 'Save to a slot'),
    h('button', { class: 'btn', onclick: () => exportSave(state) }, 'Export to a file'),
    h('p', { class: 'small muted', style: { margin: '0 0.2rem' } },
      'War by letters: export after your turns and send the file to a fellow mortal. They load it and play on. The deterministic chronicle keeps everyone honest.'),
    h('button', {
      class: 'btn',
      onclick: () => {
        modal.close();
        openSettingsPanel(screen.app);
      },
    }, 'Settings'),
    h('button', {
      class: 'btn',
      onclick: () => {
        modal.close();
        screen.app.toTitle();
      },
    }, 'To the title'),
    screen.current().kind === 'human' && state.phase === 'playing'
      ? h('button', {
          class: 'btn btn-quiet',
          onclick: () => {
            modal.close();
            const confirmContent = h('div', { style: { padding: '1rem' } },
              h('p', {}, 'Lay down the banner for good? Your provinces go free, your name goes to the footnotes.'),
              h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.8rem' } },
                h('button', {
                  class: 'btn btn-seal',
                  onclick: () => {
                    confirmModal.close();
                    screen.dispatch({ t: 'concede' });
                  },
                }, 'Concede the war'),
                h('button', { class: 'btn', onclick: () => confirmModal.close() }, 'Fight on'),
              ),
            );
            const confirmModal = openModal('Concede?', confirmContent);
          },
        }, 'Concede…')
      : null,
    h('p', { class: 'small muted italic' }, `Seed “${state.seed}”. Share it and the realm reforges identically.`),
  );
  const modal = openModal('The Table', content);
}

function nextFreeSlot(): number | null {
  const taken = new Set(listSlots().filter((s) => !s.auto).map((s) => parseInt(s.key.slice(4), 10)));
  for (let i = 1; i <= 5; i++) {
    if (!taken.has(i)) return i;
  }
  return null; // never silently overwrite an old campaign
}

export { loadSlot };
