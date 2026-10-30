const CACHE = 'gresidence-v1'
const SHELL = '/'
const LIMIT = 300
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

const isStatic = (url) =>
  (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) || FONT_HOSTS.includes(url.hostname)

const storable = (response) => response.ok || response.type === 'opaque'

const trim = async (cache) => {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - LIMIT)).map((key) => cache.delete(key)))
}

const put = async (request, response) => {
  const cache = await caches.open(CACHE)
  await cache.put(request, response)
  await trim(cache)
}

const shell = async (request) => {
  try {
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') await put(SHELL, response.clone())
    return response
  } catch (error) {
    const cached = await caches.match(SHELL)
    if (cached) return cached
    throw error
  }
}

const cacheFirst = async (request) => {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (storable(response)) await put(request, response.clone())
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin === self.location.origin && (url.pathname === '/api' || url.pathname.startsWith('/api/'))) return
  if (request.mode === 'navigate' && url.origin === self.location.origin) event.respondWith(shell(request))
  else if (isStatic(url)) event.respondWith(cacheFirst(request))
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache' || !Array.isArray(event.data.urls)) return
  const requests = event.data.urls
    .filter((href) => typeof href === 'string' && isStatic(new URL(href)))
    .map((href) =>
      new URL(href).origin === self.location.origin
        ? new Request(href)
        : new Request(href, { mode: 'cors', credentials: 'omit' }),
    )
  event.waitUntil(Promise.all(requests.map((request) => cacheFirst(request).catch(() => undefined))))
})
