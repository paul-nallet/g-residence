import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiHandler } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'

test('boîte à idées : envoi, filtre et visibilité limitée pour le ménage', async () => {
  const { port, sqlite } = database(),
    web = createApiHandler(port)
  const request = (path: string, session: string, method = 'GET', body?: unknown) =>
    web.handler(
      new Request('http://localhost/api' + path, {
        method,
        headers: {
          origin: 'http://localhost',
          ...(session ? { cookie: session } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  try {
    const setup = await request('/auth/setup', '', 'POST', {
      name: 'Gestionnaire',
      residenceName: 'Résidence test',
      email: 'admin@example.test',
      password: 'Validation-seulement-2026',
    })
    const admin = setup.headers.get('set-cookie')!.split(';')[0]!
    const invite = await request('/team/invitations', admin, 'POST', { email: 'menage@example.test', role: 'cleaner' })
    const { token } = (await invite.json()) as { token: string }
    const accept = await request('/auth/invitations/' + token, '', 'POST', {
      name: 'Agent',
      password: 'Validation-seulement-2026',
    })
    const cleaner = accept.headers.get('set-cookie')!.split(';')[0]!

    assert.equal((await request('/feedback', '')).status, 401)
    assert.equal((await request('/feedback', admin, 'POST', { kind: 'bug', message: '   ' })).status, 400)
    assert.equal((await request('/feedback', admin, 'POST', { kind: 'autre', message: 'x' })).status, 400)
    assert.equal(
      (await request('/feedback', admin, 'POST', { kind: 'bug', message: ' Le calendrier saute ' })).status,
      200,
    )
    assert.equal(
      (await request('/feedback', cleaner, 'POST', { kind: 'idea', message: 'Une checklist imprimable' })).status,
      200,
    )

    const all = (await (await request('/feedback', admin)).json()) as {
      items: { message: string; author: string }[]
      total: number
    }
    assert.equal(all.total, 2)
    assert.ok(all.items.some((item) => item.message === 'Le calendrier saute' && item.author === 'Gestionnaire'))
    const bugs = (await (await request('/feedback?kind=bug', admin)).json()) as { total: number }
    assert.equal(bugs.total, 1)
    const own = (await (await request('/feedback', cleaner)).json()) as { items: { author: string }[]; total: number }
    assert.equal(own.total, 1)
    assert.equal(own.items[0]!.author, 'Agent')
  } finally {
    await web.dispose()
    sqlite.close()
  }
})
