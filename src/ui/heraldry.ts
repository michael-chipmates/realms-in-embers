/**
 * Heraldic shields: each lord's sigil on a heater shield in their colors.
 * Pure SVG: crisp at any size, themeable, zero assets.
 */
import { LORD_BY_ID } from '../engine/content/lords';
import type { SigilPattern } from '../engine/content/lords';
import { iconPathOf } from './icons';
import { h } from './dom';

/** Every fill pattern the map renderer can draw, in deterministic order. */
export const SIGIL_PATTERNS: readonly SigilPattern[] =
  ['plain', 'stripes', 'dots', 'checks', 'waves', 'crosshatch'];

/**
 * Deterministic, collision-free pattern assignment for the lords actually
 * seated this game. Twelve lords share six patterns, so two seated lords can
 * carry the same one: invisible in color, hostile in colorblind mode.
 *
 * Each lord keeps their heraldic pattern when it is free (first come in seat
 * order wins); a lord whose pattern is taken receives the first unused
 * pattern instead. Pure and UI-only: no state, no RNG, no rules change.
 * With at most six seats and six patterns, uniqueness is guaranteed.
 */
export function assignPatterns(lordIds: readonly string[]): Record<string, SigilPattern> {
  const out: Record<string, SigilPattern> = {};
  const taken = new Set<SigilPattern>();
  // first pass: everyone whose own pattern is still free keeps it
  for (const id of lordIds) {
    if (out[id] !== undefined) continue; // same lord seated twice: one entry
    const own = LORD_BY_ID[id]?.pattern ?? 'plain';
    if (!taken.has(own)) {
      out[id] = own;
      taken.add(own);
    }
  }
  // second pass: the displaced take the first unused pattern, in seat order
  for (const id of lordIds) {
    if (out[id] !== undefined) continue;
    const free = SIGIL_PATTERNS.find((p) => !taken.has(p)) ?? 'plain';
    out[id] = free;
    taken.add(free);
  }
  return out;
}

/** ids must be unique per INSTANCE: the same lord renders in many places. */
let shieldSerial = 0;

export function sigilShield(lordId: string, size = 34): HTMLElement {
  const lord = LORD_BY_ID[lordId];
  if (!lord) return h('span');
  const path = iconPathOf(lord.sigil);
  const clipId = `shield-${lordId}-${++shieldSerial}`;
  const html = `
<svg width="${size}" height="${Math.round(size * 1.15)}" viewBox="0 0 24 28" aria-hidden="true" class="sigil-shield">
  <defs>
    <clipPath id="${clipId}"><path d="M2 2h20v12c0 6-4.5 10.5-10 12C6.5 24.5 2 20 2 14V2z"/></clipPath>
  </defs>
  <path d="M2 2h20v12c0 6-4.5 10.5-10 12C6.5 24.5 2 20 2 14V2z" fill="${lord.color}" stroke="#1e150c" stroke-width="1.2"/>
  <path d="M2 2h20v6H2z" fill="${lord.colorAlt}" opacity="0.85" clip-path="url(#${clipId})"/>
  <g transform="translate(4.4, 6.8) scale(0.63)" fill="none" stroke="#f2e8cf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">
    <path d="${path}"/>
  </g>
  <path d="M2 2h20v12c0 6-4.5 10.5-10 12C6.5 24.5 2 20 2 14V2z" fill="none" stroke="rgba(255,235,190,0.35)" stroke-width="0.7"/>
</svg>`;
  const wrap = h('span', { class: 'sigil-wrap', title: `${lord.name}, ${lord.epithet}` });
  wrap.innerHTML = html;
  return wrap;
}
