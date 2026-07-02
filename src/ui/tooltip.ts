/**
 * One global tooltip: hover, keyboard focus, and touch long-press all feed
 * it. Content is built lazily per anchor via a registry function, so
 * tooltips always show current numbers.
 */
import { clear } from './dom';

type TipBuilder = () => HTMLElement | string | null;

let tipEl: HTMLDivElement | null = null;
let currentAnchor: HTMLElement | null = null;
let longPressTimer: number | null = null;

function ensureTip(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.style.display = 'none';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function show(anchor: HTMLElement): void {
  const builder = builders.get(anchor);
  if (!builder) return;
  const content = builder();
  if (!content) return;
  const tip = ensureTip();
  clear(tip);
  if (typeof content === 'string') tip.textContent = content;
  else tip.appendChild(content);
  tip.style.display = 'block';
  currentAnchor = anchor;
  position(anchor, tip);
}

function position(anchor: HTMLElement, tip: HTMLDivElement): void {
  const rect = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let x = rect.left + rect.width / 2 - tw / 2;
  let y = rect.top - th - 8;
  if (y < 8) y = rect.bottom + 8;
  x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - th - 8));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

export function hideTip(): void {
  if (tipEl) tipEl.style.display = 'none';
  currentAnchor = null;
}

const builders = new WeakMap<HTMLElement, TipBuilder>();

/** Attach a lazy tooltip to an element (hover + focus + long-press). */
export function tip(el: HTMLElement, builder: TipBuilder | string): void {
  builders.set(el, typeof builder === 'string' ? () => builder : builder);
  if (!el.hasAttribute('tabindex') && el.tagName !== 'BUTTON' && el.tagName !== 'A' && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') {
    el.setAttribute('tabindex', '0');
  }
  el.addEventListener('mouseenter', () => show(el));
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('focus', () => show(el));
  el.addEventListener('blur', hideTip);
  el.addEventListener('touchstart', (e) => {
    longPressTimer = window.setTimeout(() => {
      show(el);
      e.preventDefault();
    }, 450);
  }, { passive: false });
  el.addEventListener('touchend', () => {
    if (longPressTimer) window.clearTimeout(longPressTimer);
    window.setTimeout(hideTip, 1400);
  });
}

window.addEventListener('scroll', hideTip, true);
window.addEventListener('resize', () => {
  if (currentAnchor && tipEl && tipEl.style.display === 'block') position(currentAnchor, tipEl);
});

/** Standard breakdown table for itemized numbers. */
export function breakdown(title: string, lines: { label: string; amount: number }[], totalLabel?: string): HTMLElement {
  const root = document.createElement('div');
  const h = document.createElement('div');
  h.className = 'tip-title';
  h.textContent = title;
  root.appendChild(h);
  const table = document.createElement('div');
  table.className = 'tip-lines';
  for (const line of lines) {
    const row = document.createElement('div');
    row.className = 'tip-line';
    const label = document.createElement('span');
    label.textContent = line.label;
    const amount = document.createElement('span');
    amount.textContent = `${line.amount > 0 ? '+' : ''}${Math.round(line.amount * 10) / 10}`;
    amount.className = line.amount > 0 ? 'pos' : line.amount < 0 ? 'neg' : '';
    row.append(label, amount);
    table.appendChild(row);
  }
  root.appendChild(table);
  if (totalLabel) {
    const total = document.createElement('div');
    total.className = 'tip-total';
    total.textContent = totalLabel;
    root.appendChild(total);
  }
  return root;
}
