// Service worker : garde l'app en mémoire pour qu'elle s'ouvre même sans réseau
// (l'IA et la météo, elles, ont toujours besoin d'Internet).
const VERSION = 'capricorne-v3';
const FICHIERS = ['./', 'index.html', 'js/images.js', 'js/animations.js', 'js/capri-extras.js', 'js/effets.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS.map((f) => new URL(f, self.registration.scope)))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((noms) => Promise.all(
    noms.filter((n) => n.startsWith('capricorne-') && n !== VERSION).map((n) => caches.delete(n)))));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req).then((r) => r || fetch(req).catch(() => caches.match(new URL('./', self.registration.scope)))));
});
