// Service Worker for PWA functionality
const CACHE_NAME = 'mc-blog-v1';
const BASE_PATH = '';
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/blog/`,
  `${BASE_PATH}/about/`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`,
  `${BASE_PATH}/manifest.webmanifest`,
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch((err) => {
        console.log('Cache addAll error:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Navigation preload: the browser fires the page request in parallel with
      // starting this worker, instead of waiting for the worker to boot and then
      // fetch. On a repeat visit that is the difference between the HTML being
      // in flight immediately and it waiting on service-worker startup.
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable().catch(() => {})
        : Promise.resolve(),
    ])
  );
  self.clients.claim();
});

// Fetch event - split strategy:
//   • Immutable assets (content-hashed /_next/static/ chunks, fonts, images) → cache-first.
//     `public/_headers` also marks these immutable on Pages; the SW makes repeat visits
//     skip the network entirely. A new deploy bumps CACHE_NAME (stamp-sw-version.ts) so
//     the `activate` cleanup still busts these.
//   • Everything else (HTML / navigations) → network-first so content stays fresh.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cross-origin (gtag.js, the artifact service, fonts) is never cacheable here —
  // cachePut already rejects non-`basic` responses — and routing it through the
  // network-first branch below only risks respondWith() rejecting when the offline
  // fallback misses. Leave those requests to the browser.
  if (url.origin !== self.location.origin) return;

  // App Router client navigations fetch `?_rsc=` payloads. Those were going
  // through the network-first branch below and being cloned into the cache on
  // every page switch, for an entry that is never useful while online (a failed
  // RSC fetch makes Next hard-navigate, which the cached HTML then serves). Skip
  // the clone and the cache write; the browser handles the request as normal.
  if (url.searchParams.has('_rsc')) return;

  const immutable =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:woff2?|png|svg|ico|jpe?g|webp|avif|wav)$/.test(url.pathname);

  const cachePut = (response) => {
    if (response && response.status === 200 && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  };

  if (immutable) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then(cachePut)
      )
    );
    return;
  }

  // Network-first for HTML/navigations; fall back to cache when offline.
  // `caches.match` resolves to undefined on a miss, and respondWith(undefined)
  // rejects — so surface a real error response instead.
  // For navigations, use the preloaded response if the browser already started
  // one (see `activate`); otherwise fetch as before.
  const network = () =>
    event.request.mode === 'navigate' && event.preloadResponse
      ? event.preloadResponse.then((preloaded) => preloaded || fetch(event.request))
      : fetch(event.request);
  event.respondWith(
    network()
      .then(cachePut)
      .catch(() =>
        caches.match(event.request).then((cached) => cached || Response.error())
      )
  );
});
