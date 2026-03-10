import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite конфігурація для Quiz Room Auto фронтенду
export default defineConfig({
  plugins: [react()],

  // Вихідна директорія збірки - backend/server.js очікує frontend/build/
  build: {
    outDir: 'build',
    emptyOutDir: true
  },

  // Проксі для dev-сервера: перенаправляє API та WebSocket на бекенд
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
      '/socket.io': {
        target: 'http://localhost:8080',
        ws: true
      }
    }
  }
});
