/// <reference lib="webworker" />
// Service worker пульта: офлайн-кэш сборки (US-16) и показ пушей (US-10).
// Собирается vite-plugin-pwa в режиме injectManifest, в основной tsconfig не входит.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('install', () => { void self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  let d: { title?: string; body?: string; url?: string; tag?: string } = {}
  try { d = e.data?.json() ?? {} } catch { d = { body: e.data?.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'Пульт', {
    body: d.body || '',
    tag: d.tag,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const target = new URL((e.notification.data as { url?: string })?.url || '/', self.registration.scope).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) { await w.navigate(target); return w.focus() }
    }
    return self.clients.openWindow(target)
  })())
})
