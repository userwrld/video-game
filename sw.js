// Network first so updates arrive; the cache is the offline fallback. Same-origin GET only.
const CACHE = 'monkeys-vs-opps-v52';
const FILES = ['./', 'index.html', 'style.css', 'reg.js', 'game.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'art/boss_bandit.webp', 'art/boss_ninja.webp', 'art/boss_ammo.webp', 'art/boss_ghillie.webp'].concat(['volt','gunner','blaze','frost','toxic','thunder','shadow','tank','plasma','chaos','royal','crimson','sky','rogue','medic','robin','bling','slash','storm','leaf','gravity','dj','sand','gear','tide','star'].flatMap(n => ['art/hero_' + n + '.webp', 'art/hero_' + n + '_card.webp']));
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request))
  );
});
