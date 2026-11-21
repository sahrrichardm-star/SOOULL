const CACHE_NAME = 'sooull-shell-v3'
const APP_SHELL = ['/manifest.webmanifest', '/sooull-mark.svg']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const shellResponse = await fetch('/', { cache: 'no-cache' })
    if (!shellResponse.ok) throw new Error('Could not cache the SOOULL application shell.')
    await cache.put('/', shellResponse.clone())
    const html = await shellResponse.text()
    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => match[1])
    await cache.addAll([...new Set([...APP_SHELL, ...assetUrls])])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('sooull-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Only same-origin application assets are cached. Supabase auth, database,
  // Storage and all private account responses are deliberately never cached.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
      return response
    })())
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put('/', response.clone())
        }
        return response
      } catch {
        const cached = await caches.match('/')
        return cached || new Response('SOOULL is offline. Reconnect to access your private account data.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })())
  }
})
