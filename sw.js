// Offline cache: network-first for freshness, cache fallback when offline.
const CACHE = 'ambient-v54';
const ASSETS = ['./', 'index.html', 'css/style.css', 'css/arcade.css', 'css/arcade-intrus.css', 'css/arcade-bouge.css', 'css/arcade-reponds.css', 'css/arcade-modes.css', 'css/arcade-accordeur.css', 'css/arcade-dictee.css', 'css/save.css', 'css/placement.css', 'css/pacts.css', 'css/latency.css', 'css/daily.css', 'manifest.webmanifest', 'icon.svg', 'js/theory.js', 'js/params.js', 'js/engine.js', 'js/layers.js', 'js/sequencer.js', 'js/audition.js', 'js/arcade.js', 'js/pacts.js', 'js/latency.js', 'js/arcade/hautbas.js', 'js/arcade/intrus.js', 'js/arcade/bouge.js', 'js/arcade/reponds.js', 'js/arcade/modes.js', 'js/arcade/accordeur.js', 'js/arcade/dictee.js', 'js/game.js', 'js/tree.js', 'js/presets.js', 'js/generator.js', 'js/visual.js', 'js/scenes.js', 'js/journal.js', 'js/history.js', 'js/pianoroll.js', 'js/pulses.js', 'js/bass.js', 'js/chords.js', 'js/midi.js', 'js/automation.js', 'js/song.js', 'js/widgets.js', 'js/perform.js', 'js/rec.js', 'js/ui.js', 'js/play.js', 'js/contracts.js', 'js/puzzles.js', 'js/secrets.js', 'js/garden.js', 'js/juice.js', 'js/garden-tree.js', 'js/garden-actions.js', 'js/save.js', 'js/arcade-ui.js', 'js/placement.js', 'js/daily.js', 'js/duel.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // always revalidate with the server: the HTTP cache must never serve a stale mix of old and new scripts
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
