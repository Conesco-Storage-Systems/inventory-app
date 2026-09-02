import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Site map images and similar reference photos can be several MB; still worth
        // precaching so they're available offline in the field, not just on WiFi.
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
      },
      manifest: {
        name: 'Conesco Racking Inventory',
        short_name: 'Racking Inventory',
        description: 'Field inventory app for used pallet racking components',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#08060d',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
})
