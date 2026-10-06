import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ['volumes-acorn-pupil.ngrok-free.dev'],
    proxy: {
      '/api/payments/vnpay/ipn': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      // Keep ordinary app API requests working on the local frontend, but do
      // not expose the backend API through the public ngrok frontend tunnel.
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        bypass: (req) => {
          const host = req.headers.host ?? '';
          if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
            return req.url;
          }
        },
      },
    },
  },
});
