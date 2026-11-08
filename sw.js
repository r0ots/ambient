// Offline cache: network-first for freshness, cache fallback when offline.
const CACHE = 'ambient-v4';
const ASSETS = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icon.svg',
  'js/theory.js', 'js/params.js', 'js/engine.js', 'js/layers.js', 'js/sequencer.js', 'js/presets.js', 'js/visual.js', 'js/scenes.js', 'js/ui.js', 'js/play.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
