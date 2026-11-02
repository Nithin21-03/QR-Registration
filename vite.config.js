import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true, // Listen on all network addresses (allows phones on same Wi-Fi to test)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.warn('[Vite Proxy] Server unreachable at 127.0.0.1:5001:', err.message);
          });
        },
      },
    },
  },
  preview: {
    port: 5174,
    host: true, // Listen on all network addresses for mobile preview
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.warn('[Vite Preview Proxy] Server unreachable at 127.0.0.1:5001:', err.message);
          });
        },
      },
    },
  },
});
