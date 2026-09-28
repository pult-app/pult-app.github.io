import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Пульт отдельный продукт, не часть сайта-портфолио (ADR-005). Путь задаётся при сборке.
const base = process.env.PULT_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Свой service worker (src/sw.ts): кэш сборки плюс обработка пушей.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Пульт Германа',
        short_name: 'Пульт',
        description: 'Пары, дедлайны, воронка стажировок, учёба и тренажёр',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F1F0EE',
        theme_color: '#141416',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
