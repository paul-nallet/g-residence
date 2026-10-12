import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createApiHandler } from '../src/server/Http.ts'
import { memoryReadCache, withReadCache } from '../src/server/ReadCache.ts'
import { database } from './helpers/database.ts'

const environment = async () => {
  const { port, sqlite } = database()
  const web = createApiHandler(port)
  let calls = 0
  const handler = withReadCache(
    (request) => {
      calls++
      return web.handler(request)
    },
    port,
    memoryReadCache(),
  )
  const request = (path: string, cookie: string, method = 'GET', body?: unknown) =>
    handler(
      new Request('http://localhost/api' + path, {
        method,
        headers: {
          origin: 'http://localhost',
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  const setup = await request('/auth/setup', '', 'POST', {
    name: 'Gestionnaire',
    residenceName: 'Résidence test',
    email: 'admin@example.test',
    password: 'Validation-seulement-2026',
  })
  assert.equal(setup.status, 200)
  const cookie = setup.headers.get('set-cookie')!.split(';')[0]!
  return {
    request,
    cookie,
    sqlite,
    calls: () => calls,
    dispose: async () => {
      await web.dispose()
      sqlite.close()
    },
  }
}
const version = async (response: Response) => ((await response.json()) as { version: number }).version
const item = { name: 'Café', categories: [], unit: 'paquets', threshold: 1, initial: 4 }

describe('synchronisation', () => {
  test('chaque table de résidence incrémente la version sur insertion, modification et suppression', () => {
    const { sqlite } = database()
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => String(row.name))
      .filter((name) =>
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .some((column) => column.name === 'residence_id' && name !== 'residence_sync'),
      )
    const triggers = new Set(
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'sync_%'")
        .all()
        .map((row) => String(row.name)),
    )
    const missing = tables.flatMap((table) =>
      ['insert', 'update', 'delete'].map((event) => `sync_${table}_${event}`).filter((name) => !triggers.has(name)),
    )
    assert.ok(tables.length > 30)
    assert.deepEqual(missing, [], 'Ajouter les triggers de synchronisation dans une migration.')
    sqlite.close()
  })

  test('la version suit les écritures de la résidence', async () => {
    const e = await environment()
    try {
      const before = await version(await e.request('/sync', e.cookie))
      assert.equal((await e.request('/stock', e.cookie, 'POST', item)).status, 200)
      const after = await version(await e.request('/sync', e.cookie))
      assert.ok(after > before)
      assert.equal(await version(await e.request('/sync', e.cookie)), after)
      assert.equal((await e.request('/sync', '')).status, 401)
    } finally {
      await e.dispose()
    }
  })

  test('le cache sert les lectures jusqu’à la prochaine écriture, par utilisateur', async () => {
    const e = await environment()
    try {
      const first = await e.request('/stock', e.cookie)
      assert.equal(first.headers.get('x-cache'), 'miss')
      assert.equal(first.headers.get('cache-control'), 'no-store')
      const calls = e.calls()
      const second = await e.request('/stock', e.cookie)
      assert.equal(second.headers.get('x-cache'), 'hit')
      assert.equal(second.headers.get('cache-control'), 'no-store')
      assert.equal(e.calls(), calls)
      assert.deepEqual(await second.json(), await first.json())

      assert.equal((await e.request('/stock', e.cookie, 'POST', item)).status, 200)
      const fresh = await e.request('/stock', e.cookie)
      assert.equal(fresh.headers.get('x-cache'), 'miss')
      assert.deepEqual(
        ((await fresh.json()) as { items: { name: string }[] }).items.map((entry) => entry.name),
        ['Café'],
      )

      assert.equal((await e.request('/stock?q=the', e.cookie)).headers.get('x-cache'), 'miss')
      assert.equal((await e.request('/stock', '')).status, 401)
      assert.equal((await e.request('/stock', 'gresidence_session=inconnue')).status, 401)
      e.sqlite.prepare('DELETE FROM sessions').run()
      assert.equal((await e.request('/stock', e.cookie)).status, 401)
    } finally {
      await e.dispose()
    }
  })

  test('le cache mémoire expire et reste borné', () => {
    let now = 0
    const cache = memoryReadCache({ capacity: 2, ttl: 1000, clock: () => now })
    const entry = (body: string) => ({ body, headers: [] })
    cache.set('a', entry('A'))
    cache.set('b', entry('B'))
    assert.equal(cache.get('a')?.body, 'A')
    cache.set('c', entry('C'))
    assert.equal(cache.get('b'), undefined)
    assert.equal(cache.get('a')?.body, 'A')
    now = 1001
    assert.equal(cache.get('c'), undefined)
  })
})
