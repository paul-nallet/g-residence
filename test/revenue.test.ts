import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { netOf, revenueYear, vatBreakdown } from '../src/domain/revenue.ts'
import { createApiHandler } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'

type Page = {
  items: {
    id: string
    name: string
    latest_period: string | null
    latest_amount: number | null
    month_amount: number | null
    month_vat_mode: string | null
  }[]
  total: number
  pending: number
  month_net: number
  month_gross: number
}
const ttc = { vat_mode: 'ttc', vat_rate: 2000 }
const ht = { vat_mode: 'ht', vat_rate: null }

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

test('TVA : HT arrondi au centime le plus proche, TVA par différence, source HT sans taux', () => {
  assert.equal(netOf(12000, 2000), 10000)
  assert.equal(netOf(3, 2000), 3)
  assert.equal(netOf(6, 2000), 5)
  assert.equal(netOf(1055, 550), 1000)
  assert.equal(netOf(100000000000, 210), 97943192948)
  assert.deepEqual(vatBreakdown(15490, 'ttc', 2000), {
    vat_mode: 'ttc',
    vat_rate: 2000,
    net_cents: 12908,
    vat_cents: 2582,
  })
  assert.deepEqual(vatBreakdown(510, 'ht', null), { vat_mode: 'ht', vat_rate: null, net_cents: 510, vat_cents: null })
})

const entry = (source_id: string, period: string, amount_cents: number, mode: 'ttc' | 'ht' = 'ttc') => ({
  source_id,
  period,
  amount_cents,
  ...vatBreakdown(amount_cents, mode, mode === 'ttc' ? 2000 : null),
})

test('récapitulatif annuel : totaux par source et par mois, HT, TTC et TVA, export protégé', () => {
  const recap = revenueYear(
    2026,
    [
      { id: 'a', name: 'Café', vat_mode: 'ttc', vat_rate: 2000 },
      { id: 'b', name: '=Laverie', vat_mode: 'ht', vat_rate: null },
    ],
    [entry('a', '2026-01', 12050), entry('b', '2026-01', 1000, 'ht'), entry('a', '2026-03', 0)],
  )
  assert.deepEqual(recap.rows[0]!.months.slice(0, 4), [12050, null, 0, null])
  assert.equal(recap.rows[0]!.total, 12050)
  assert.equal(recap.rows[0]!.total_net, 10042)
  assert.equal(recap.rows[0]!.total_vat, 2008)
  assert.equal(recap.rows[1]!.total_vat, null)
  assert.equal(recap.net.months[0], 11042)
  assert.equal(recap.gross.months[0], 12050)
  assert.equal(recap.vat.total, 2008)
  assert.equal(recap.net.total, 11042)
  const lines = recap.tsv.split('\r\n')
  assert.equal(lines.length, 6)
  assert.deepEqual(lines[0]!.split('\t').slice(0, 3), ['Source', 'Saisie', 'janvier 2026'])
  assert.deepEqual(lines[0]!.split('\t').slice(-3), ['Total saisi', 'Total HT', 'TVA'])
  assert.deepEqual(lines[1]!.split('\t').slice(0, 5), ['Café', 'TTC 20 %', '120,50', '', '0,00'])
  assert.deepEqual(lines[1]!.split('\t').slice(-3), ['120,50', '100,42', '20,08'])
  assert.deepEqual(lines[2]!.split('\t').slice(0, 2), ["'=Laverie", 'HT'])
  assert.equal(lines[2]!.split('\t').at(-1), '')
  assert.deepEqual(lines[3]!.split('\t').slice(0, 3), ['Total HT', 'toutes sources', '110,42'])
  assert.deepEqual(lines[4]!.split('\t').slice(0, 3), ['Total TTC', 'sources TTC', '120,50'])
  assert.equal(lines[5]!.split('\t').at(-1), '20,08')
})

test('prestations : sources, saisie mensuelle, corrections, récapitulatif et isolation', async () => {
  const e = await environment()
  try {
    assert.equal((await e.request('/revenue?month=2026-09', 'GET', undefined, '')).status, 401)
    assert.equal((await e.request('/revenue', 'POST', { name: ' ', description: '', ...ttc })).status, 400)
    for (const vat of [
      { vat_mode: 'ttc', vat_rate: null },
      { vat_mode: 'ht', vat_rate: 2000 },
      { vat_mode: 'ttc', vat_rate: 1900 },
    ])
      assert.equal((await e.request('/revenue', 'POST', { name: 'Snacks', description: '', ...vat })).status, 400)
    assert.equal(
      (await e.request('/revenue', 'POST', { name: 'Café', description: 'Machine du hall', ...ttc })).status,
      200,
    )
    assert.equal((await e.request('/revenue', 'POST', { name: 'café', description: '', ...ttc })).status, 409)
    assert.equal((await e.request('/revenue', 'POST', { name: 'Laverie', description: '', ...ht })).status, 200)
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
    assert.equal(list.month_net, 12908 + 510)
    assert.equal(list.month_gross, 15490)
    assert.equal(list.items[1]!.month_vat_mode, 'ht')
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
      (await e.request('/revenue/' + cafe, 'PATCH', { name: 'Café et snacks', description: '', ...ttc })).status,
      200,
    )
    assert.equal(
      (await e.request('/revenue/' + cafe, 'PATCH', { name: 'LAVERIE', description: '', ...ttc })).status,
      409,
    )
    const recap = (await (await e.request('/revenue/years/2026')).json()) as {
      rows: { name: string; months: (number | null)[]; total: number; total_net: number }[]
      net: { months: number[]; total: number }
      gross: { months: number[]; total: number }
      tsv: string
    }
    assert.deepEqual(
      recap.rows.map((row) => [row.name, row.total, row.total_net]),
      [
        ['Café et snacks', 25440, 12908 + 8292],
        ['Laverie', 510, 510],
      ],
    )
    assert.equal(recap.net.months[8], 12908 + 510)
    assert.equal(recap.gross.total, 25440)
    assert.match(recap.tsv, /^Source\tSaisie\tjanvier 2026/)
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

test('TVA : nature et taux figés à la saisie, repris à la correction et tracés', async () => {
  const e = await environment()
  try {
    assert.equal((await e.request('/revenue', 'POST', { name: 'Café', description: '', ...ttc })).status, 200)
    const [cafe] = ((await (await e.request('/revenue?month=2026-09')).json()) as Page).items
    const path = '/revenue/' + cafe!.id + '/entries'
    assert.equal((await e.request(path, 'POST', { period: '2026-08', amount_cents: 11000, comment: '' })).status, 200)
    assert.equal(
      (
        await e.request('/revenue/' + cafe!.id, 'PATCH', {
          name: 'Café',
          description: '',
          vat_mode: 'ttc',
          vat_rate: 1000,
        })
      ).status,
      200,
    )
    assert.equal((await e.request(path, 'POST', { period: '2026-09', amount_cents: 11000, comment: '' })).status, 200)
    type History = {
      items: {
        id: string
        period: string
        vat_mode: string
        vat_rate: number | null
        net_cents: number
        vat_cents: number | null
      }[]
    }
    let history = (await (await e.request(path)).json()) as History
    assert.deepEqual(
      history.items.map((row) => [row.period, row.vat_rate, row.net_cents, row.vat_cents]),
      [
        ['2026-09', 1000, 10000, 1000],
        ['2026-08', 2000, 9167, 1833],
      ],
    )
    assert.equal(
      (await e.request('/revenue/' + cafe!.id, 'PATCH', { name: 'Café', description: '', ...ht })).status,
      200,
    )
    const august = history.items[1]!.id
    assert.equal(
      (await e.request(path + '/' + august, 'PATCH', { period: '2026-08', amount_cents: 9000, comment: 'Relevé HT' }))
        .status,
      200,
    )
    history = (await (await e.request(path)).json()) as History
    assert.deepEqual(
      history.items.map((row) => [row.period, row.vat_mode, row.vat_rate, row.net_cents, row.vat_cents]),
      [
        ['2026-09', 'ttc', 1000, 10000, 1000],
        ['2026-08', 'ht', null, 9000, null],
      ],
    )
    const source = (await (await e.request('/revenue/' + cafe!.id)).json()) as {
      vat_mode: string
      vat_rate: number | null
    }
    assert.deepEqual([source.vat_mode, source.vat_rate], ['ht', null])
    const changes = e.sqlite
      .prepare('SELECT before_json,after_json FROM revenue_source_changes ORDER BY created_at,rowid')
      .all() as { before_json: string | null; after_json: string }[]
    assert.equal(changes.length, 3)
    assert.equal(JSON.parse(changes[1]!.before_json!).vat_rate, 2000)
    assert.equal(JSON.parse(changes[2]!.after_json).vat_mode, 'ht')
    const correction = e.sqlite
      .prepare(`SELECT after_json FROM revenue_entry_changes WHERE entry_id=? ORDER BY created_at DESC,rowid DESC`)
      .get(august) as { after_json: string }
    assert.equal(JSON.parse(correction.after_json).vat_mode, 'ht')
    assert.throws(
      () => e.sqlite.prepare('UPDATE revenue_entries SET vat_cents=0 WHERE id=?').run(august),
      /revenue_vat_invalid/,
    )
  } finally {
    await e.dispose()
  }
})

test('migration TVA : saisies existantes passées TTC au taux par défaut', () => {
  const { sqlite } = database('0015_sync.sql')
  sqlite.exec('PRAGMA foreign_keys=OFF')
  sqlite.exec("INSERT INTO revenue_sources(id,residence_id,name) VALUES('s','r','Café')")
  sqlite.exec(
    `INSERT INTO revenue_entries(id,residence_id,source_id,period,amount_cents,actor_id,updated_at)
    VALUES('a','r','s','2026-01',12000,'u','t'),('b','r','s','2026-02',3,'u','t')`,
  )
  sqlite.exec(readFileSync(new URL('../migrations/0016_revenue_vat.sql', import.meta.url), 'utf8'))
  assert.deepEqual(
    sqlite
      .prepare('SELECT vat_mode,vat_rate,net_cents,vat_cents FROM revenue_entries ORDER BY id')
      .all()
      .map((row) => ({ ...row })),
    [
      { vat_mode: 'ttc', vat_rate: 2000, net_cents: 10000, vat_cents: 2000 },
      { vat_mode: 'ttc', vat_rate: 2000, net_cents: 3, vat_cents: 0 },
    ],
  )
  assert.deepEqual(
    { ...(sqlite.prepare('SELECT vat_mode,vat_rate FROM revenue_sources').get() as object) },
    {
      vat_mode: 'ttc',
      vat_rate: 2000,
    },
  )
  sqlite.close()
})
