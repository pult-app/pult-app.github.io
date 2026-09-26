import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Сайт живёт на germanpolkin.ru/pult/ (GitHub Pages проекта под пользовательским доменом).
export default defineConfig({
  base: '/pult/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Пульт Германа',
        short_name: 'Пульт',
        description: 'Пары, дедлайны, воронка стажировок, учёба и тренажёр',
        lang: 'ru',
        start_url: '/pult/',
        scope: '/pult/',
        display: 'standalone',
        background_color: '#EEF2F4',
        theme_color: '#1E6A86',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/pult/index.html',
        // Ответы Supabase не кэшируются service worker'ом: офлайн-копия данных лежит в localStorage (US-16).
        runtimeCaching: [],
      },
    }),
  ],
  test: { environment: 'node' },
})
