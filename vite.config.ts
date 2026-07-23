import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed at https://<user>.github.io/usage-calculator/
export default defineConfig({
  base: '/usage-calculator/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Zählerstand — Home Utility Calculator',
        short_name: 'Zählerstand',
        description:
          'Zählerstände erfassen, Verbrauch und Kosten berechnen, Guthaben oder Nachzahlung prognostizieren.',
        lang: 'de-DE',
        start_url: '/usage-calculator/',
        scope: '/usage-calculator/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/usage-calculator/index.html',
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/domain/**/*.test.ts', 'src/sync/**/*.test.ts', 'src/crypto/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'data',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/data/**/*.test.ts', 'src/ui/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
