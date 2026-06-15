/* Service worker CDM 2026 — scope dédié pour installation PWA Android */
const CACHE = 'cdm2026-shell-v1';
const PRECACHE = [
  '/portailClub/apps/cdm2026/index.html',
  '/portailClub/apps/cdm2026/manifest.php',
  '/portailClub/apps/cdm2026/assets/img/icon-192.png',
  '/portailClub/apps/cdm2026/assets/img/icon-512.png',
];

function inScope(pathname) {
  return (
    pathname.startsWith('/portailClub/apps/cdm2026/') ||
    pathname.startsWith('/portailClub/api/cdm2026/')
  );
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!inScope(url.pathname)) return;
  event.respondWith(networkFirst(event.request));
});
