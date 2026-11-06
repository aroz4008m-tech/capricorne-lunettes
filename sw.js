// Garde l'app en mémoire pour qu'elle s'ouvre même sans réseau.
// Avec réseau : toujours la version la plus récente du site. Sans réseau : la copie gardée.
const CACHE = 'capricorne';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
        return rep;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match(new URL('./', self.registration.scope)))),
  );
});
