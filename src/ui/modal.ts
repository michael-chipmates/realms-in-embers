/** Accessible modal: focus trap, Escape to close, click-outside optional. */
import { h } from './dom';
import { iconSvg } from './icons';

export interface ModalHandle {
  close: () => void;
  el: HTMLElement;
}

let openCount = 0;
const openHandles: ModalHandle[] = [];

export function openModal(
  title: string,
  content: HTMLElement,
  opts: { wide?: boolean; onClose?: () => void; dismissable?: boolean; className?: string } = {},
): ModalHandle {
  const dismissable = opts.dismissable !== false;
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const closeBtn = h('button', {
    class: 'btn btn-quiet modal-close',
    'aria-label': 'Close',
    html: iconSvg('close', 18),
  }) as HTMLButtonElement;

  const panel = h(
    'div',
    {
      class: `modal-panel panel ${opts.wide ? 'modal-wide' : ''} ${opts.className ?? ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
    h('div', { class: 'modal-head' }, h('h2', { class: 'panel-title', style: { border: 'none', padding: '0' } }, title), dismissable ? closeBtn : null),
    content,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, panel);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    openCount--;
    const idx = openHandles.findIndex((hd) => hd.el === panel);
    if (idx >= 0) openHandles.splice(idx, 1);
    document.removeEventListener('keydown', onKey, true);
    opts.onClose?.();
    previouslyFocused?.focus?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    // stacked modals: only the topmost one listens
    if (openHandles[openHandles.length - 1]?.el !== panel) return;
    if (e.key === 'Escape' && dismissable) {
      e.stopImmediatePropagation(); // one Escape, one modal, never the whole stack
      close();
    } else if (e.key === 'Tab') {
      // simple focus trap (disabled controls can't take focus, so skip them)
      const focusables = [...panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  closeBtn.addEventListener('click', close);
  if (dismissable) {
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close();
    });
  }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  openCount++;
  const handle = { close, el: panel };
  openHandles.push(handle);
  // focus the first interactive element
  requestAnimationFrame(() => {
    const focusable = panel.querySelector<HTMLElement>(
      'button:not(.modal-close):not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]',
    );
    (focusable ?? closeBtn).focus();
  });
  return handle;
}

/** Focus containment for full-screen overlays that are not modals (the
 * hotseat blackout, ceremonies, the opening of the chronicle). Keeps Tab
 * inside `container` and focuses its first control. Returns a cleanup. */
export function trapFocus(container: HTMLElement): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab' || !container.isConnected) return;
    const focusables = [...container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )];
    if (focusables.length === 0) { e.preventDefault(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (!container.contains(active)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => {
    container.querySelector<HTMLElement>('button:not(:disabled), [tabindex]')?.focus();
  });
  return () => document.removeEventListener('keydown', onKey, true);
}

export function anyModalOpen(): boolean {
  return openCount > 0;
}

/** Close every open modal through its real close path (listeners, count, onClose). */
export function closeAllModals(): void {
  for (const handle of [...openHandles].reverse()) handle.close();
}
