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
        theme_color: '#0B0D10',
        background_color: '#0B0D10',
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
        // Default is 2 MiB. The lazy-loaded exercise-seeding chunk (the
        // matching manifests for both media providers, only fetched when a
        // screen first needs exercise data -- see its own separate chunk in
        // the build output) crossed that in v0.1.5 once Free Exercise DB's
        // 876-entry manifest joined Workout Guide's. Raised with headroom
        // rather than trimming the manifests, since the data is genuinely
        // used (by the matchers, not dead weight) and this chunk was never
        // part of the initial app-shell load either way.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Exercise media (apps/web/public/exercise-media -- Workout Guide's
        // .png frames plus, since v0.1.5, Free Exercise DB's .jpg start/end
        // pairs under exercise-media/fed/) must not be eagerly precached on
        // install/update -- every user would download the whole pack
        // before the app shell even finished activating. Cached lazily
        // instead, one exercise at a time as it's actually viewed, via the
        // runtimeCaching rule below. See docs/EXERCISE_MEDIA.md.
        globIgnores: ['exercise-media/**'],
        runtimeCaching: [
          {
            // Both providers' file extensions -- a v0.1.5 fix: this
            // pattern originally matched only .png (Workout Guide), so
            // Free Exercise DB's .jpg files would have silently never
            // been cached for offline reuse. Caught by inspecting the
            // built service worker, not by a report of it failing live.
            urlPattern: /\/exercise-media\/.*\.(png|jpg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'atlas-exercise-media',
              expiration: {
                // Comfortably above the 845 files (291 Workout Guide +
                // 554 Free Exercise DB) actually shipped as of v0.1.5 --
                // this is a safety ceiling on the runtime cache, not a
                // precache list, so headroom costs nothing until a real
                // user's browsing approaches it.
                maxEntries: 1000,
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
