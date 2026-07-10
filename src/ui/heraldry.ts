/**
 * Heraldic shields: each lord's sigil on a heater shield in their colors.
 * Pure SVG — crisp at any size, themeable, zero assets.
 */
import { LORD_BY_ID } from '../engine/content/lords';
import { iconPathOf } from './icons';
import { h } from './dom';

/** ids must be unique per INSTANCE — the same lord renders in many places. */
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
