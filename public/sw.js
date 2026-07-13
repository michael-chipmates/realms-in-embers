/* Realms in Embers — offline keeper.
 * Two caches, two lifetimes:
 *   rie-app-<build>  — the shell + hashed /assets/ bundles. Rebuilt every
 *                      deploy (the build stamps __BUILD__ below). Older
 *                      rie-app-* caches are swept only after the new shell
 *                      posts BOOT_OK — a deploy that cannot boot never
 *                      destroys the last shell that could.
 *   rie-media        — /art/, /music/, /audio/. Content-addressed or
 *                      immutable in practice, so it survives deploys and is
 *                      served cache-first: a phone downloads the score once.
 * Navigations stay network-first with cache fallback: a fresh deploy is
 * picked up on the next visit, and the cached shell still answers when the
 * wire is gone. The whole game keeps working with no network after one
 * visit — only the online-war relay needs a wire. */
const BUILD = '__BUILD__';
const APP_CACHE = `rie-app-${BUILD}`;
const MEDIA_CACHE = 'rie-media';
// The build stamps the hashed bundles in below: installing the worker
// precaches the WHOLE boot (shell + js + css), so the very first visit is
// enough for a full offline launch. Before, only the shell was precached
// and an uncontrolled first visit could strand offline boots with HTML but
// no executable bundle (review R3).
const PRECACHE = /* __PRECACHE__ */ [];
const SHELL = [
  '.', 'manifest.webmanifest', 'favicon.svg',
  // the chronicle's letterform (IM Fell English) boots offline with the shell
  'fonts/im-fell-english.woff2', 'fonts/im-fell-english-italic.woff2',
].concat(PRECACHE);
// Media files only — the .json manifests living beside them (audio/manifest,
// music/playlist) can change across deploys and stay stale-while-revalidate.
const MEDIA_PATH = /\/(art|music|audio)\/.+\.(m4a|mp3|ogg|wav|flac|webp|png|jpe?g|gif|svg|avif)$/i;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)));
  // no skipWaiting: a fresh deploy waits politely for the next launch —
  // seizing control mid-campaign mixes versions under a live game (review R2)
});

self.addEventListener('activate', (e) => {
  // Only LEGACY caches (rie-v1/rie-v2, pre-split) are swept on activate.
  // Older rie-app-<build> caches survive until the new shell proves it
  // boots (BOOT_OK below) — a broken deploy must never destroy the last
  // shell that worked.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('rie-') && !k.startsWith('rie-app-') && k !== MEDIA_CACHE)
          .map((k) => caches.delete(k)),
      )),
  );
});

self.addEventListener('message', (e) => {
  const t = e.data && e.data.t;
  if (t === 'BOOT_OK') {
    // this build's shell stands: yesterday's app caches may go
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => k.startsWith('rie-app-') && k !== APP_CACHE)
        .map((k) => caches.delete(k)),
    ));
  } else if (t === 'SKIP_WAITING') {
    // a deliberate act from the title screen — never automatic
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Navigations go network-first: a fresh deploy is picked up on the next
  // visit, and the cached shell still answers when the wire is gone.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        try {
          const res = await fetch(e.request);
          if (res.ok) {
            const path = new URL(e.request.url).pathname;
            // Only the game shell may claim the shell slot — a visit to
            // /press.html or /codex/* must never hijack offline app entry
            if (path === '/' || path === '/index.html') cache.put('.', res.clone());
            else cache.put(e.request, res.clone());
          }
          return res;
        } catch {
          return (await cache.match(e.request)) ?? (await cache.match('.')) ?? Response.error();
        }
      }),
    );
    return;
  }

  // Media is effectively immutable: serve from cache, fetch once to fill.
  if (MEDIA_PATH.test(url.pathname)) {
    e.respondWith(mediaResponse(e.request, url));
    return;
  }

  // App files (hashed bundles and friends): stale-while-revalidate.
  e.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? refresh;
    }),
  );
});

/** Cache-first media, with explicit Range support. Safari streams audio via
 * Range requests and rejects a plain 200 in reply — and a 206 can never be
 * cache.put — so on a range miss we fetch the WHOLE file once, cache it,
 * and slice 206es out of the cached body from then on. One download, ever. */
async function mediaResponse(request, url) {
  const cache = await caches.open(MEDIA_CACHE);
  let full = await cache.match(url.href);
  if (!full) {
    if (request.headers.has('range')) {
      const res = await fetch(url.href).catch(() => null);
      if (!res || res.status !== 200) return fetch(request);
      await cache.put(url.href, res.clone());
      full = res;
    } else {
      const res = await fetch(request);
      if (res.status === 200) cache.put(url.href, res.clone());
      return res;
    }
  }
  const range = /^bytes=(\d+)-(\d+)?$/.exec(request.headers.get('range') ?? '');
  if (!range) return full;
  const buf = await full.arrayBuffer();
  const start = Number(range[1]);
  const end = range[2] ? Math.min(Number(range[2]), buf.byteLength - 1) : buf.byteLength - 1;
  if (start >= buf.byteLength) return new Response(null, { status: 416 });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') ?? '',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
    },
  });
}
