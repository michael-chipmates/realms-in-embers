/** Accessible modal: focus trap, Escape to close, click-outside optional. */
import { h } from './dom';
import { iconSvg } from './icons';

export interface ModalHandle {
  close: () => void;
  el: HTMLElement;
}

let openCount = 0;

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

  const close = (): void => {
    backdrop.remove();
    openCount--;
    document.removeEventListener('keydown', onKey, true);
    opts.onClose?.();
    previouslyFocused?.focus?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      // simple focus trap
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
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
  // focus the first interactive element
  requestAnimationFrame(() => {
    const focusable = panel.querySelector<HTMLElement>('button:not(.modal-close), input, select, [tabindex]');
    (focusable ?? closeBtn).focus();
  });
  return { close, el: panel };
}

export function anyModalOpen(): boolean {
  return openCount > 0;
}
