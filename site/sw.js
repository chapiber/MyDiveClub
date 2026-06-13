/* Service worker Portail Club — network-first pour JS/CSS/HTML, cache offline en secours */
const STATIC_CACHE = 'portail-club-static-v1';
const STATIC_ASSETS = [
  '/portailClub/assets/icons/icon-192.svg',
  '/portailClub/assets/icons/icon-512.svg',
  '/portailClub/assets/icons/icon-maskable.svg',
];

function isApiRequest(url) {
  return url.pathname.includes('/api/');
}

function isVersionRequest(url) {
  return url.pathname === '/portailClub/version.json';
}

function isMutableAsset(url) {
  if (!url.pathname.startsWith('/portailClub/')) return false;
  if (isApiRequest(url) || isVersionRequest(url)) return true;
  if (url.pathname.startsWith('/portailClub/apps/')) return true;
  if (/\.(js|css|html)$/.test(url.pathname)) return true;
  if (url.pathname === '/portailClub/' || url.pathname === '/portailClub') return true;
  return false;
}

function isStaticImmutable(url) {
  return /\/assets\/icons\//.test(url.pathname) && url.pathname.endsWith('.svg');
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw _;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function getAppCacheName() {
  try {
    const res = await fetch('/portailClub/version.json', { cache: 'no-store' });
    if (!res.ok) return 'portail-club-app';
    const data = await res.json();
    return 'portail-club-app-' + (data.version || 'default');
  } catch (_) {
    return 'portail-club-app';
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keepApp = await getAppCacheName();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('portail-club-app-') && k !== keepApp)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/portailClub/')) return;

  if (isStaticImmutable(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (isMutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cacheName = await getAppCacheName();
        return networkFirst(event.request, cacheName);
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cacheName = await getAppCacheName();
      return networkFirst(event.request, cacheName);
    })()
  );
});
