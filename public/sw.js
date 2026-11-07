// Offline cache so local game management works without a network. Streaming and Lifetime Winnings still need one.
const CACHE = 'bets-manager-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

// Caches every file in Vite's build manifest, so routes never visited also open offline; drops old build files.
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
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/assets/') && !files.has(path)) await cache.delete(request);
  }
  const missing = [];
  for (const file of files) {
    if (!(await cache.match(file))) missing.push(file);
  }
  await cache.addAll(missing);
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
    // Network first, so a new deploy shows up; refresh the cached build while online.
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE)
              .then(cache => cache.put('/index.html', copy))
              .then(syncBuildFiles)
              .catch(err => console.error('Offline cache refresh failed:', err))
          );
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Build files are content-hashed and never change, so cache first. ignoreVary: the app's crossorigin
  // requests carry an Origin header, which misses entries cached without one when a server sends Vary: Origin.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    }))
  );
});
