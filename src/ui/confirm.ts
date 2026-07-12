/**
 * The pause before the seal. Every act that spends, sends, or cannot be
 * taken back opens this small card first: what the act does in plain words,
 * the price from the engine's own evaluation, then the seal or a step back.
 * One pattern for every surface, so a stray tap on a phone never musters a
 * company or buries an art unasked.
 */
import { evaluateAction } from '../engine/evaluate';
import { spellCostFor } from '../engine/magic';
import { SPELLS } from '../engine/content/spells';
import type { Action, SpellId } from '../engine/types';
import { h } from './dom';
import { iconSvg } from './icons';
import { openModal } from './modal';
import type { GameScreen } from './screens/game';

export interface ConfirmSpec {
  title: string;
  /** What the act does: plain sentences with the numbers already in them. */
  body: (HTMLElement | string | null)[];
  /** Evaluated for legality and itemized costs, dispatched on the seal. */
  action: Action;
  confirmLabel: string;
  cancelLabel?: string;
  /** After a successful dispatch (audio, refresh, reselect). */
  onDone?: () => void;
  /** When the player steps back (Escape and close included). */
  onCancel?: () => void;
}

export function confirmAction(screen: GameScreen, spec: ConfirmSpec): void {
  const verdict = evaluateAction(screen.state, spec.action);
  let confirmed = false;
  const confirmBtn = h('button', {
    class: 'btn btn-seal',
    disabled: !verdict.legal,
  }, spec.confirmLabel) as HTMLButtonElement;
  const modal = openModal(spec.title, h('div', { class: 'confirm-body' },
    ...spec.body.filter(Boolean),
    ...verdict.costs.map((c) => h('p', { class: 'small confirm-cost' },
      h('span', { html: iconSvg(c.resource === 'gold' ? 'gold' : 'ember', 13) }),
      ` ${c.label}: ${c.amount} ${c.resource === 'gold' ? 'gold' : 'Emberlight'}`)),
    ...verdict.reasons.map((r) => h('p', { class: 'small neg' }, r)),
    h('div', { class: 'confirm-actions' },
      h('button', { class: 'btn', onclick: () => modal.close() }, spec.cancelLabel ?? 'Go back'),
      confirmBtn,
    ),
  ), {
    onClose: () => { if (!confirmed) spec.onCancel?.(); },
  });
  confirmBtn.onclick = () => {
    confirmed = true;
    modal.close();
    if (screen.dispatch(spec.action)) spec.onDone?.();
  };
}

/** The one confirm for casting a working, targeted or not. */
export function confirmCast(
  screen: GameScreen,
  spell: SpellId,
  province?: number,
  opts: { onDone?: () => void; onCancel?: () => void } = {},
): void {
  const def = SPELLS[spell];
  const state = screen.state;
  const cost = spellCostFor(state, screen.viewerId(), spell);
  const target = province !== undefined ? state.provinces[province] : null;
  confirmAction(screen, {
    title: target ? `Cast ${def.name} on ${target.name}?` : `Cast ${def.name}?`,
    body: [
      h('p', { class: 'small' }, def.desc),
      def.cooldown > 0
        ? h('p', { class: 'small muted' },
            `Once cast, it gathers for ${def.cooldown} ${def.cooldown === 1 ? 'season' : 'seasons'} before the next working.`)
        : null,
      h('p', { class: 'small italic muted' }, def.flavor),
    ],
    action: province !== undefined ? { t: 'castSpell', spell, province } : { t: 'castSpell', spell },
    confirmLabel: 'Cast it',
    // the cast's own effects voice the spell; nothing to play here
    onDone: opts.onDone,
    onCancel: opts.onCancel,
  });
}
