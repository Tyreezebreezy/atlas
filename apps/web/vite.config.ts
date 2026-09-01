import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'ATLAS',
        short_name: 'ATLAS',
        description: 'Local-first fitness and training tracker',
        theme_color: '#F2F0EA',
        background_color: '#F2F0EA',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Exercise animation frames (~32MB, apps/web/public/exercise-media)
        // must not be eagerly precached on install/update -- every user
        // would download the whole pack before the app shell even
        // finished activating. Cached lazily instead, one exercise at a
        // time as it's actually viewed, via the runtimeCaching rule below.
        // See docs/EXERCISE_MEDIA.md.
        globIgnores: ['exercise-media/**'],
        runtimeCaching: [
          {
            urlPattern: /\/exercise-media\/.*\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'atlas-exercise-media',
              expiration: {
                maxEntries: 906,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
