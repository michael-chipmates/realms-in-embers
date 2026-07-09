/* Realms in Embers — offline keeper.
 * Strategy: cache-as-you-go. The app shell precaches at install; every
 * same-origin GET (hashed assets, art, music) is cached on first use and
 * served stale-while-revalidate after. The whole game keeps working with
 * no network after one visit — only the online-war relay needs a wire. */
const CACHE = 'rie-v1';
const SHELL = ['.', 'manifest.webmanifest', 'favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
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
