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
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - split strategy:
//   • Immutable assets (content-hashed /_next/static/ chunks, fonts, images) → cache-first.
//     GitHub Pages can't set `Cache-Control: immutable`, so the SW is the only lever; a new
//     deploy bumps CACHE_NAME (stamp-sw-version.ts) so the `activate` cleanup still busts these.
//   • Everything else (HTML / navigations) → network-first so content stays fresh.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cross-origin (gtag.js, the artifact service, fonts) is never cacheable here —
  // cachePut already rejects non-`basic` responses — and routing it through the
  // network-first branch below only risks respondWith() rejecting when the offline
  // fallback misses. Leave those requests to the browser.
  if (url.origin !== self.location.origin) return;

  const immutable =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:woff2?|png|svg|ico|jpe?g|webp|avif)$/.test(url.pathname);

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
  event.respondWith(
    fetch(event.request)
      .then(cachePut)
      .catch(() =>
        caches.match(event.request).then((cached) => cached || Response.error())
      )
  );
});
