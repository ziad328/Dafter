import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API = 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The student app installs from here. Off in dev (devOptions), so `pnpm dev` and e2e never
    // run a stale service worker.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'دفتر',
        short_name: 'دفتر',
        description: 'جدولك وحضورك في السنتر',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/s',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111111',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell only: API responses are never cached.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  envDir: '../..',
  server: {
    port: 5173,
    proxy: { '/api': API, '/health': API },
  },
});
