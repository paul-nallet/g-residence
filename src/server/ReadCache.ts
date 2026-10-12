import { Session } from '../api/Api.ts'
import { tokenDigest } from '../services/Accounts.ts'
import { sql, type DatabasePort } from '../services/Database.ts'

export type CachedResponse = { readonly body: string; readonly headers: readonly (readonly [string, string])[] }
export interface ReadCachePort {
  get(key: string): CachedResponse | undefined
  set(key: string, value: CachedResponse): void
}

export const memoryReadCache = ({ capacity = 500, ttl = 60_000, clock = Date.now } = {}): ReadCachePort => {
  const entries = new Map<string, CachedResponse & { readonly storedAt: number }>()
  return {
    get: (key) => {
      const entry = entries.get(key)
      if (!entry) return undefined
      entries.delete(key)
      if (clock() - entry.storedAt > ttl) return undefined
      entries.set(key, entry)
      return entry
    },
    set: (key, value) => {
      entries.delete(key)
      entries.set(key, { ...value, storedAt: clock() })
      for (const oldest of entries.keys()) {
        if (entries.size <= capacity) break
        entries.delete(oldest)
      }
    },
  }
}

const sessionToken = (request: Request) =>
  (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === Session.key)?.[1] ?? ''

const stamp = (digest: string, at: string) =>
  sql(
    `SELECT u.id AS user,COALESCE(v.version,0) AS version FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN residence_sync v ON v.residence_id=u.residence_id WHERE s.hash=? AND s.expires_at>? AND u.disabled=0`,
    digest,
    at,
  )

const withCacheHeader = (headers: CachedResponse['headers'], state: 'hit' | 'miss') => {
  const result = new Headers(headers.map(([name, value]) => [name, value]))
  result.set('x-cache', state)
  return result
}

export const withReadCache =
  (
    handle: (request: Request) => Promise<Response>,
    db: DatabasePort,
    cache: ReadCachePort,
    now = () => new Date().toISOString(),
  ) =>
  async (request: Request) => {
    const url = new URL(request.url)
    const token = request.method === 'GET' && !url.pathname.startsWith('/api/auth/') ? sessionToken(request) : ''
    if (!token) return handle(request)
    const current = await db
      .first<{ user: string; version: number }>(stamp(await tokenDigest(token), now()))
      .catch(() => null)
    if (!current) return handle(request)
    const key = [current.user, current.version, url.pathname + url.search].join('|')
    const hit = cache.get(key)
    if (hit) return new Response(hit.body, { status: 200, headers: withCacheHeader(hit.headers, 'hit') })
    const response = await handle(request)
    if (response.status !== 200 || response.headers.has('set-cookie')) return response
    const cached = { body: await response.text(), headers: [...response.headers.entries()] }
    cache.set(key, cached)
    return new Response(cached.body, { status: 200, headers: withCacheHeader(cached.headers, 'miss') })
  }
