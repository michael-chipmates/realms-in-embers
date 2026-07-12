/** Tiny hyperscript helper: the whole UI is built with this. */

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'dataset') Object.assign(el.dataset, value as Record<string, string>);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'html') {
      el.innerHTML = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el: HTMLElement, children: (Child | Child[])[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Guard a button that does something irreversible: the first press only
 * arms it (the label turns into a plain question) and the act fires on a
 * second press within a few seconds. A stray tap costs nothing; walking
 * away (or tabbing away) quietly stands the button down.
 */
export function armToConfirm(btn: HTMLElement, armedText: string, fire: () => void): HTMLElement {
  let armed = false;
  let timer = 0;
  let restHtml = '';
  let restAria: string | null = null;
  const disarm = (): void => {
    if (!armed) return;
    armed = false;
    window.clearTimeout(timer);
    btn.classList.remove('btn-armed');
    btn.innerHTML = restHtml;
    if (restAria !== null) btn.setAttribute('aria-label', restAria);
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      restHtml = btn.innerHTML;
      restAria = btn.getAttribute('aria-label');
      btn.classList.add('btn-armed');
      btn.textContent = armedText;
      btn.setAttribute('aria-label', armedText);
      timer = window.setTimeout(disarm, 3200);
    } else {
      disarm();
      fire();
    }
  });
  btn.addEventListener('blur', disarm);
  return btn;
}

/** Replace all children of `el` with `children`. */
export function mount(el: HTMLElement, ...children: (Child | Child[])[]): void {
  clear(el);
  appendChildren(el, children);
}
