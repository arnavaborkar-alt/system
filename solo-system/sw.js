/* Shell cache only — app data lives in localStorage + the cloud, never here. */
const CACHE = 'solo-system-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/js/main.js', '/js/ui.js', '/js/store.js', '/js/engine.js', '/js/config.js', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;          // never cache live data
  if (url.origin !== location.origin) return;

  // network first so a redeploy shows up immediately, cache as the fallback
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
