import { defineConfig } from 'vite';

// La PWA se sirve bajo la ruta /asistencia/ (start_url del manifest).
// `base` asegura que los assets y los archivos de `public/` (manifest.webmanifest,
// sw.js e iconos) se resuelvan correctamente tanto en dev como en build.
export default defineConfig({
  base: '/asistencia/',
  server: { port: 5173 },
  preview: { port: 4173 },
});
