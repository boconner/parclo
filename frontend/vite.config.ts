import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: 'Parclo',
        short_name: 'Parclo',
        description: 'Retail execution — inventory & field rep management',
        theme_color: '#724fac',
        background_color: '#ffffff',
        display: 'standalone',
        // display_override lets modern browsers use the best display mode available
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Separate maskable entry — 'any maskable' combined is ignored by some browsers
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Log Visit', short_name: 'Log', url: '/stores', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Calendar', short_name: 'Calendar', url: '/calendar', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
        categories: ['business', 'productivity'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'mapbox-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
