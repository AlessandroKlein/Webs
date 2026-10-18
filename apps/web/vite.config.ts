import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend en desarrollo: se sirve en http://localhost:5173 y proxea la API y
// el WebSocket al backend (apps/api) en http://localhost:4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
