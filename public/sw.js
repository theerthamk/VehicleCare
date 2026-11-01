// VehicleCare service worker.
// - Pre-caches the app shell (HTML, CSS, JS, icons) so pages open quickly.
// - NEVER caches /api/ responses: they contain private, per-user data.
// - Pages are network-first so users always get fresh HTML when online.
// Change CACHE_VERSION whenever you change files in /public.
const CACHE_VERSION = 'vehiclecare-v1';

const APP_SHELL = [
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/api.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/vehicles.js',
  '/js/maintenance.js',
  '/js/services.js',
  '/js/history.js',
  '/js/notifications.js',
  '/js/profile.js',
  '/pages/owner.html',
  '/pages/caretaker.html',
  '/pages/vehicles.html',
  '/pages/maintenance.html',
  '/pages/services.html',
  '/pages/history.html',
  '/pages/notifications.html',
  '/pages/profile.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Private data: always go to the network, never store.
  if (url.pathname.startsWith('/api/')) return;

  // HTML pages: network first, fall back to cached copy, then the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true })
          .then((cached) => cached || caches.match('/offline.html')))
    );
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
