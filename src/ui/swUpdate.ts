/**
 * The staged service-worker handshake (trust wave 2):
 *
 *  - Every healthy production boot posts BOOT_OK to the controlling worker.
 *    Only then does the worker sweep older app caches: a shell that never
 *    manages to boot never destroys the last one that did.
 *  - A freshly installed worker WAITS (no skipWaiting): the update applies
 *    on the next launch, or right now from the title screen, a deliberate
 *    act in a quiet room, never a seizure mid-campaign.
 */

let waitingReg: ServiceWorkerRegistration | null = null;
let readyCb: (() => void) | null = null;

export function registerSw(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('sw.js').then((reg) => {
      const watch = (): void => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingReg = reg;
          readyCb?.();
        }
      };
      watch();
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', watch);
      });
    });
    // the shell booted far enough to run this module: tell the worker the
    // new edition stands, and yesterday's cache may go
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ t: 'BOOT_OK' });
    }).catch(() => undefined);
  });
}

/** A fresh edition is installed and waiting. Fires at most once. */
export function onUpdateReady(cb: () => void): void {
  readyCb = cb;
  if (waitingReg) cb();
}

/** Apply the waiting edition now (title screen only): tell it to take over,
 * then reload when it does. */
export function applyUpdate(): void {
  const waiting = waitingReg?.waiting;
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage({ t: 'SKIP_WAITING' });
}

export function updateWaiting(): boolean {
  return waitingReg?.waiting != null;
}
