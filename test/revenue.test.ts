import assert from 'node:assert/strict'
import test from 'node:test'
import { revenueYear } from '../src/domain/revenue.ts'
import { createApiHandler } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'

type Page = {
  items: {
    id: string
    name: string
    latest_period: string | null
    latest_amount: number | null
    month_amount: number | null
  }[]
  total: number
  pending: number
  month_total: number
}

const environment = async () => {
  const { port, sqlite } = database(),
    web = createApiHandler(port)
  let cookie = ''
  const request = (path: string, method = 'GET', body?: unknown, session = cookie, origin = 'http://localhost') =>
    web.handler(
      new Request('http://localhost/api' + path, {
        method,
        headers: {
          origin,
          ...(session ? { cookie: session } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  const setup = await request('/auth/setup', 'POST', {
    name: 'Gestionnaire',
    residenceName: 'Résidence test',
    email: 'admin@example.test',
    password: 'Validation-seulement-2026',
  })
  assert.equal(setup.status, 200, await setup.clone().text())
  cookie = setup.headers.get('set-cookie')!.split(';')[0]!
  return {
    request,
    sqlite,
    dispose: async () => {
      await web.dispose()
      sqlite.close()
    },
  }
}

test('récapitulatif annuel : totaux par source et par mois, export protégé', () => {
  const recap = revenueYear(
    2026,
    [
      { id: 'a', name: 'Café' },
      { id: 'b', name: '=Laverie' },
    ],
    [
      { source_id: 'a', period: '2026-01', amount_cents: 12050 },
      { source_id: 'b', period: '2026-01', amount_cents: 1000 },
      { source_id: 'a', period: '2026-03', amount_cents: 0 },
    ],
  )
  assert.deepEqual(recap.rows[0]!.months.slice(0, 4), [12050, null, 0, null])
  assert.equal(recap.rows[0]!.total, 12050)
  assert.equal(recap.months[0], 13050)
  assert.equal(recap.total, 13050)
  const lines = recap.tsv.split('\r\n')
  assert.equal(lines.length, 4)
  assert.equal(lines[0]!.split('\t')[1], 'janvier 2026')
  assert.deepEqual(lines[1]!.split('\t').slice(0, 4), ['Café', '120,50', '', '0,00'])
  assert.equal(lines[2]!.split('\t')[0], "'=Laverie")
  assert.equal(lines[3]!.split('\t').at(-1), '130,50')
})

test('prestations : sources, saisie mensuelle, corrections, récapitulatif et isolation', async () => {
  const e = await environment()
  try {
    assert.equal((await e.request('/revenue?month=2026-09', 'GET', undefined, '')).status, 401)
    assert.equal((await e.request('/revenue', 'POST', { name: ' ', description: '' })).status, 400)
    assert.equal((await e.request('/revenue', 'POST', { name: 'Café', description: 'Machine du hall' })).status, 200)
    assert.equal((await e.request('/revenue', 'POST', { name: 'café', description: '' })).status, 409)
    assert.equal((await e.request('/revenue', 'POST', { name: 'Laverie', description: '' })).status, 200)
    let list = (await (await e.request('/revenue?month=2026-09')).json()) as Page
    assert.deepEqual(
      list.items.map((item) => item.name),
      ['Café', 'Laverie'],
    )
    assert.equal(list.pending, 2)
    const [cafe, laverie] = list.items.map((item) => item.id)
    const path = '/revenue/' + cafe + '/entries'
    for (const period of ['2026-13', '2026-9', '2999-01'])
      assert.equal((await e.request(path, 'POST', { period, amount_cents: 100, comment: '' })).status, 400)
    for (const amount_cents of [-1, 1.5])
      assert.equal((await e.request(path, 'POST', { period: '2026-09', amount_cents, comment: '' })).status, 400)
    assert.equal((await e.request(path, 'POST', { period: '2026-09', amount_cents: 15490, comment: '' })).status, 200)
    assert.equal((await e.request(path, 'POST', { period: '2026-09', amount_cents: 1, comment: '' })).status, 409)
    assert.equal(
      (await e.request(path, 'POST', { period: '2026-08', amount_cents: 9900, comment: 'Août' })).status,
      200,
    )
    assert.equal(
      (
        await e.request('/revenue/' + laverie + '/entries', 'POST', {
          period: '2026-09',
          amount_cents: 510,
          comment: '',
        })
      ).status,
      200,
    )
    list = (await (await e.request('/revenue?month=2026-09')).json()) as Page
    assert.equal(list.month_total, 16000)
    assert.equal(list.pending, 0)
    assert.equal(list.items[0]!.latest_period, '2026-09')
    assert.equal(list.items[0]!.month_amount, 15490)
    assert.equal(((await (await e.request('/revenue?month=2026-08&pending=true')).json()) as Page).total, 1)
    let history = (await (await e.request(path)).json()) as {
      items: { id: string; period: string; amount_cents: number; actor: string }[]
      total: number
    }
    assert.deepEqual(
      history.items.map((row) => row.period),
      ['2026-09', '2026-08'],
    )
    assert.equal(history.items[0]!.actor, 'Gestionnaire')
    const entryId = history.items[1]!.id
    assert.equal(
      (await e.request(path + '/' + entryId, 'PATCH', { period: '2026-09', amount_cents: 1, comment: '' })).status,
      409,
    )
    assert.equal(
      (await e.request(path + '/' + entryId, 'PATCH', { period: '2026-07', amount_cents: 9950, comment: 'Juillet' }))
        .status,
      200,
    )
    history = (await (await e.request(path)).json()) as typeof history
    assert.deepEqual(
      history.items.map((row) => [row.period, row.amount_cents]),
      [
        ['2026-09', 15490],
        ['2026-07', 9950],
      ],
    )
    assert.equal((e.sqlite.prepare('SELECT COUNT(*) AS n FROM revenue_entry_changes').get() as { n: number }).n, 4)
    assert.equal(
      (await e.request('/revenue/' + cafe, 'PATCH', { name: 'Café et snacks', description: '' })).status,
      200,
    )
    assert.equal((await e.request('/revenue/' + cafe, 'PATCH', { name: 'LAVERIE', description: '' })).status, 409)
    const recap = (await (await e.request('/revenue/years/2026')).json()) as {
      rows: { name: string; months: (number | null)[]; total: number }[]
      months: number[]
      total: number
      tsv: string
    }
    assert.deepEqual(
      recap.rows.map((row) => [row.name, row.total]),
      [
        ['Café et snacks', 25440],
        ['Laverie', 510],
      ],
    )
    assert.equal(recap.months[8], 16000)
    assert.equal(recap.total, 25950)
    assert.match(recap.tsv, /^Source\tjanvier 2026/)
    assert.equal((await e.request('/revenue/years/1999')).status, 400)
    assert.equal((await e.request('/revenue?month=2026-13')).status, 400)
    assert.equal((await e.request(path + '?page=0')).status, 400)
    assert.equal(
      (
        await e.request(
          path,
          'POST',
          { period: '2026-06', amount_cents: 1, comment: '' },
          undefined,
          'https://autre.example',
        )
      ).status,
      403,
    )
    e.sqlite.exec('PRAGMA foreign_keys=OFF')
    e.sqlite.exec(
      "INSERT INTO revenue_sources(id,residence_id,name) VALUES('foreign-source','autre-residence','Autre')",
    )
    e.sqlite.exec('PRAGMA foreign_keys=ON')
    assert.equal((await e.request('/revenue/foreign-source')).status, 404)
    assert.equal((await e.request('/revenue/foreign-source/entries')).status, 404)
    assert.equal(
      (await e.request('/revenue/foreign-source/entries', 'POST', { period: '2026-06', amount_cents: 1, comment: '' }))
        .status,
      404,
    )
    assert.equal(
      (
        await e.request('/revenue/' + laverie + '/entries/' + entryId, 'PATCH', {
          period: '2026-06',
          amount_cents: 1,
          comment: '',
        })
      ).status,
      404,
    )
    assert.equal(((await (await e.request('/revenue?month=2026-09')).json()) as Page).total, 2)
    const invite = (await (
      await e.request('/team/invitations', 'POST', { email: 'revenue-cleaner@example.test', role: 'cleaner' })
    ).json()) as { token: string }
    const accepted = await e.request(
      '/auth/invitations/' + invite.token,
      'POST',
      { name: 'Ménage', password: 'Validation-seulement-2026' },
      '',
    )
    const cleaner = accepted.headers.get('set-cookie')!.split(';')[0]!
    assert.equal((await e.request('/revenue?month=2026-09', 'GET', undefined, cleaner)).status, 403)
    assert.equal((await e.request('/revenue/years/2026', 'GET', undefined, cleaner)).status, 403)
    assert.equal((await e.request(path, 'GET', undefined, cleaner)).status, 403)
    assert.equal(
      (await e.request(path, 'POST', { period: '2026-06', amount_cents: 1, comment: '' }, cleaner)).status,
      403,
    )
  } finally {
    await e.dispose()
  }
})
