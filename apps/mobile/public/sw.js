// Service Worker básico de "Webs Asistencia" (PWA).
//
// Se sirve desde /asistencia/ (o la base configurada en vite.config.js), por lo
// que su scope por defecto es /asistencia/ y las URLs relativas se resuelven
// contra ese scope.

const VERSION = 'webs-asistencia-v1';

// Shell mínimo que se precachea al instalar. Los assets de Vite (JS/CSS con
// hash) se cachean en runtime con la estrategia stale-while-revalidate.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
];

// INSTALL: precache del shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE: elimina cachés de versiones viejas.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// FETCH:
// - Navegación: network-first con fallback a la caché (offline).
// - Recursos GET del mismo origen: stale-while-revalidate.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // No interceptar llamadas a otros orígenes (p. ej. la API externa).
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
