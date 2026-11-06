/**
 * Service worker mínimo: hace instalable la PWA y da un shell offline.
 * Estrategia: network-first para navegaciones (nunca sirve HTML viejo si hay
 * red) con fallback al shell cacheado; cache-first solo para assets con hash.
 */
const CACHE = 'webs-shell-v1';
const SHELL = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const pathname = new URL(request.url).pathname;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Nunca cachear la API: sus respuestas dependen de la sesión (multi-tenant).
  if (pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Assets de Vite llevan hash en el nombre: cachear es seguro.
  if (/\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico)$/.test(new URL(request.url).pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
