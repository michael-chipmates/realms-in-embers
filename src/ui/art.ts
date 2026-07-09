/**
 * The art pipeline: named slots that upgrade gracefully.
 *
 * Every illustrated surface in the game asks for a slot ("lord-seraphine",
 * "osperan", "event-harvestGlut"…). If public/art/manifest.json lists a file
 * for that slot, the image is used; otherwise the caller's procedural
 * fallback (sigil heraldry, ink vignettes) renders instead. Ship art by
 * dropping files + manifest — zero code changes. docs/ART.md carries the
 * full slot list, sizes, style guide, and generation prompts.
 */
import { h } from './dom';

let manifest: Record<string, string> | null = null;
let manifestLoading: Promise<void> | null = null;

async function loadManifest(): Promise<void> {
  if (manifest !== null) return;
  if (!manifestLoading) {
    manifestLoading = fetch('art/manifest.json')
      .then(async (res) => {
        manifest = res.ok ? ((await res.json()) as Record<string, string>) : {};
      })
      .catch(() => {
        manifest = {};
      });
  }
  await manifestLoading;
}

/** Kick off the manifest fetch early (call at boot). */
export function preloadArtManifest(): void {
  void loadManifest();
}

/**
 * Render `fallback` now; swap in the slot's image if/when available.
 * The wrapper keeps the caller's layout either way.
 */
export function artSlot(slot: string, fallback: HTMLElement, opts: { className?: string; alt?: string; eager?: boolean } = {}): HTMLElement {
  const wrap = h('span', { class: `art-slot ${opts.className ?? ''}` }, fallback);
  void loadManifest().then(() => {
    const file = manifest?.[slot];
    if (!file) return;
    const img = h('img', {
      src: `art/${file}`,
      alt: opts.alt ?? '',
      class: 'art-img',
      loading: opts.eager ? 'eager' : 'lazy',
    }) as HTMLImageElement;
    img.addEventListener('load', () => {
      wrap.replaceChildren(img);
      wrap.classList.add('art-loaded');
    });
    img.addEventListener('error', () => {
      // manifest promised something missing: keep the fallback, stay silent
    });
  });
  return wrap;
}
