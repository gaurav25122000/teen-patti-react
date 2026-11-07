// Offline cache so local game management works without a network. Streaming and Lifetime Winnings still need one.
const CACHE = 'bets-manager-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

const isHtml = response => (response.headers.get('content-type') || '').includes('text/html');

// Caches every file in Vite's build manifest (routes never visited open offline too), then drops old build files.
// Adding before deleting means a dropped connection leaves the previous build complete.
const syncBuildFiles = async () => {
  const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (!response.ok) return;
  const files = new Set();
  for (const entry of Object.values(await response.json())) {
    files.add(`/${entry.file}`);
    (entry.css || []).forEach(file => files.add(`/${file}`));
    (entry.assets || []).forEach(file => files.add(`/${file}`));
  }
  const cache = await caches.open(CACHE);
  const missing = [];
  for (const file of files) {
    if (!(await cache.match(file))) missing.push(file);
  }
  await cache.addAll(missing);
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/assets/') && !files.has(path)) await cache.delete(request);
  }
};

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(syncBuildFiles)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/')) return;

  if (request.mode === 'navigate') {
    // Network first, so a new deploy shows up; only a real app page becomes the offline shell.
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && isHtml(response)) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE)
                .then(cache => cache.put('/index.html', copy))
                .then(syncBuildFiles)
                .catch(err => console.error('Offline cache refresh failed:', err))
            );
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    // Hashed files never change: cache first. ignoreVary because crossorigin requests send Origin (Vary: Origin).
    // A missing chunk comes back as Netlify's index.html (200), so HTML is never cached under an asset path.
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
        if (response.ok && !isHtml(response)) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
        }
        return response;
      }))
    );
    return;
  }

  // Unhashed files (manifest, icons): network first so they refresh, cache as the offline fallback.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreVary: true }))
  );
});
