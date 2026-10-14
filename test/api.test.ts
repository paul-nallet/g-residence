import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiHandler, SESSION_COOKIE } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'
import type { Report } from '../src/domain/agenda.ts'
import { today } from '../src/domain/rules.ts'

const environment = async () => {
  const { port, sqlite } = database(),
    web = createApiHandler(port)
  let cookie = ''
  const request = async (
    path: string,
    method = 'GET',
    body?: unknown,
    overrideCookie = cookie,
    origin = 'http://localhost',
  ) => {
    const headers: Record<string, string> = { origin }
    if (overrideCookie) headers.cookie = overrideCookie
    if (body !== undefined) headers['content-type'] = 'application/json'
    return web.handler(
      new Request('http://localhost/api' + path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  }
  const response = await request('/auth/setup', 'POST', {
    name: 'Gestionnaire',
    residenceName: 'Résidence test',
    email: 'admin@example.test',
    password: 'Validation-seulement-2026',
  })
  assert.equal(response.status, 200, await response.clone().text())
  cookie = response.headers.get('set-cookie')!.split(';')[0]!
  sqlite
    .prepare('INSERT INTO buildings(id,residence_id,name) SELECT ?,id,? FROM residences')
    .run('test-building', 'Bâtiment test')
  return {
    request,
    sqlite,
    dispose: async () => {
      await web.dispose()
      sqlite.close()
    },
    cookie,
  }
}

test('santé, erreurs API, connexion, sessions et contrôle d’origine', async () => {
  const e = await environment()
  try {
    const health = await e.request('/health')
    assert.equal(health.status, 200)
    assert.equal(health.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await health.json(), { application: 'gresidence', status: 'ready', stage: 'v1' })
    assert.equal((await e.request('/absent')).status, 404)
    assert.equal((await e.request('/lots', 'GET', undefined, '')).status, 401)
    assert.equal(
      (
        await e.request(
          '/lots',
          'POST',
          { building_id: 'test-building', number: '101', floor: '1', type: 'Studio' },
          e.cookie,
          'https://autre.example',
        )
      ).status,
      403,
    )
    assert.equal(
      (await e.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'faux' }, '')).status,
      401,
    )
    const login = await e.request(
      '/auth/login',
      'POST',
      { email: 'ADMIN@example.test', password: 'Validation-seulement-2026' },
      '',
    )
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/)
    e.sqlite.prepare("UPDATE sessions SET expires_at='2000-01-01'").run()
    assert.equal((await e.request('/lots')).status, 401)
  } finally {
    await e.dispose()
  }
})

test('installation publique verrouillée et installation concurrente unique', async () => {
  const { port, sqlite } = database(),
    web = createApiHandler(port)
  try {
    const payload = {
      name: 'Admin',
      residenceName: 'Résidence',
      email: 'admin@example.test',
      password: 'Validation-seulement-2026',
    }
    const run = (host: string) =>
      web.handler(
        new Request('https://' + host + '/api/auth/setup', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'https://' + host },
          body: JSON.stringify(payload),
        }),
      )
    assert.equal((await run('public.example')).status, 403)
    const responses = await Promise.all([run('localhost'), run('localhost')])
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS total FROM residences').get() as { total: number }).total, 1)
  } finally {
    await web.dispose()
    sqlite.close()
  }
})

test('invitations, isolation ménage et révocation du compte', async () => {
  const e = await environment()
  try {
    await e.request('/lots', 'POST', { building_id: 'test-building', number: '101', floor: '1', type: 'Studio' })
    const lotId = (e.sqlite.prepare('SELECT id FROM lots').get() as { id: string }).id
    await e.request('/lots/' + lotId + '/stays', 'POST', {
      first_name: 'SecretPrénom',
      last_name: 'SecretNom',
      planned_start: '2026-01-01',
      planned_end: null,
    })
    const stayId = (e.sqlite.prepare('SELECT id FROM stays').get() as { id: string }).id
    await e.request('/stays/' + stayId + '/inspections', 'POST', {
      kind: 'entry',
      local_start: '2026-01-02T10:00',
      duration: 30,
      status: 'planned',
      completed_on: null,
      comment: 'SecretCommentaire',
    })
    const invite = await e.request('/team/invitations', 'POST', { email: 'menage@example.test', role: 'cleaner' })
    const { token } = (await invite.json()) as { token: string }
    const accept = await e.request(
      '/auth/invitations/' + token,
      'POST',
      { name: 'Agent', password: 'Validation-seulement-2026' },
      '',
    )
    assert.equal(accept.status, 200)
    const cleaner = accept.headers.get('set-cookie')!.split(';')[0]!
    assert.equal((await e.request('/auth/invitations/' + token, 'GET', undefined, '')).status, 404)
    const detail = await e.request('/lots/' + lotId, 'GET', undefined, cleaner)
    assert.equal(detail.status, 200)
    assert.doesNotMatch(await detail.text(), /SecretPrénom|SecretNom|SecretCommentaire/)
    const events = await e.request('/calendar?from=2026-01-01&to=2026-01-07', 'GET', undefined, cleaner)
    assert.doesNotMatch(await events.text(), /SecretPrénom|SecretNom|SecretCommentaire/)
    for (const path of ['/team', '/reports/weekly?date=2026-01-01'])
      assert.equal((await e.request(path, 'GET', undefined, cleaner)).status, 403)
    assert.equal(
      (await e.request('/lots', 'POST', { building_id: 'test-building', number: '102', floor: '', type: '' }, cleaner))
        .status,
      403,
    )
    assert.equal(
      (await e.request('/stays/' + stayId + '/actions', 'POST', { action: 'entry', date: '2026-01-01' }, cleaner))
        .status,
      403,
    )
    const uid = (await accept
      .clone()
      .json()
      .catch(() => null)) as { id: string } | null
    const memberId =
      uid?.id ?? (e.sqlite.prepare("SELECT id FROM users WHERE role='cleaner'").get() as { id: string }).id
    assert.equal(
      (await e.request('/team/members/' + memberId, 'PATCH', { role: 'cleaner', disabled: true })).status,
      200,
    )
    assert.equal((await e.request('/lots', 'GET', undefined, cleaner)).status, 401)
    assert.ok(SESSION_COOKIE)
  } finally {
    await e.dispose()
  }
})

test('chevauchement atomique, préavis et suivi distinct des états des lieux', async () => {
  const e = await environment()
  try {
    const input = { building_id: 'test-building', number: '101', floor: '1', type: 'Studio' }
    assert.equal((await e.request('/lots', 'POST', input)).status, 200)
    assert.equal((await e.request('/lots', 'POST', input)).status, 409)
    const lotId = (e.sqlite.prepare('SELECT id FROM lots').get() as { id: string }).id
    const create = (first: string) =>
      e.request('/lots/' + lotId + '/stays', 'POST', {
        first_name: first,
        last_name: 'Étudiant',
        planned_start: '2026-01-01',
        planned_end: '2026-12-01',
      })
    const concurrent = await Promise.all([create('Alice'), create('Béatrice')])
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409])
    const stayId = (e.sqlite.prepare('SELECT id FROM stays').get() as { id: string }).id
    assert.equal(
      (
        await e.request('/stays/' + stayId + '/notices', 'POST', {
          received_on: '2026-01-03',
          departure_on: '2026-04-01',
          comment: 'Départ',
        })
      ).status,
      200,
    )
    const noticeId = (e.sqlite.prepare('SELECT id FROM notices').get() as { id: string }).id
    assert.equal(
      (
        await e.request('/notices/' + noticeId, 'PATCH', {
          received_on: '2026-01-04',
          departure_on: '2026-05-01',
          comment: 'Corrigé',
        })
      ).status,
      200,
    )
    assert.equal((await e.request('/notices/' + noticeId + '/withdraw', 'POST')).status, 200)
    assert.equal(
      (e.sqlite.prepare('SELECT planned_end FROM stays').get() as { planned_end: string }).planned_end,
      '2026-12-01',
    )
    const inspection = {
      kind: 'entry',
      local_start: '2026-01-02T10:00',
      duration: 30,
      status: 'done',
      completed_on: '2026-01-02',
      comment: 'Réalisé',
    }
    assert.equal((await e.request('/stays/' + stayId + '/inspections', 'POST', inspection)).status, 200)
    assert.equal(
      (e.sqlite.prepare('SELECT actual_start FROM stays').get() as { actual_start: null }).actual_start,
      null,
    )
    assert.equal(
      (await e.request('/stays/' + stayId + '/actions', 'POST', { action: 'entry', date: '2026-01-01' })).status,
      200,
    )
    assert.equal((await e.request('/lots/' + lotId + '/archive', 'PATCH', { archived: true })).status, 409)
    assert.equal(
      (await e.request('/stays/' + stayId + '/actions', 'POST', { action: 'exit', date: '2026-01-05' })).status,
      200,
    )
    assert.equal((await e.request('/lots/' + lotId + '/archive', 'PATCH', { archived: true })).status, 200)
    assert.ok((e.sqlite.prepare('SELECT COUNT(*) AS count FROM history').get() as { count: number }).count >= 8)
  } finally {
    await e.dispose()
  }
})

test('bilan réalisé, corrections, annulation et limites de semaine', async () => {
  const e = await environment()
  try {
    await e.request('/lots', 'POST', { building_id: 'test-building', number: '101', floor: '', type: '' })
    const lotId = (e.sqlite.prepare('SELECT id FROM lots').get() as { id: string }).id
    await e.request('/lots/' + lotId + '/stays', 'POST', {
      first_name: 'Élodie',
      last_name: '=FORMULE',
      planned_start: '2026-01-01',
      planned_end: null,
    })
    const stayId = (e.sqlite.prepare('SELECT id FROM stays').get() as { id: string }).id
    await e.request('/stays/' + stayId + '/actions', 'POST', { action: 'entry', date: '2026-01-04' })
    const planned = {
      kind: 'exit',
      local_start: '2026-01-05T11:00',
      duration: 30,
      status: 'planned',
      completed_on: null,
      comment: 'ligne\nseconde\tcolonne',
    }
    await e.request('/stays/' + stayId + '/inspections', 'POST', planned)
    const iid = (e.sqlite.prepare('SELECT id FROM inspections').get() as { id: string }).id
    const before = (await (await e.request('/reports/weekly?date=2026-01-07')).json()) as {
      from: string
      to: string
      rows: unknown[]
      tsv: string
    }
    assert.equal(before.from, '2026-01-05')
    assert.equal(before.to, '2026-01-11')
    assert.equal(before.rows.length, 0)
    await e.request('/inspections/' + iid, 'PATCH', { ...planned, status: 'done', completed_on: '2026-01-06' })
    const done = (await (await e.request('/reports/weekly?date=2026-01-07')).json()) as { rows: unknown[]; tsv: string }
    assert.equal(done.rows.length, 1)
    assert.match(done.tsv, /'=FORMULE/)
    assert.match(done.tsv, /ligne seconde colonne/)
    await e.request('/inspections/' + iid, 'PATCH', { ...planned, status: 'cancelled' })
    const cancelled = (await (await e.request('/reports/weekly?date=2026-01-07')).json()) as { rows: unknown[] }
    assert.equal(cancelled.rows.length, 0)
  } finally {
    await e.dispose()
  }
})

test('bilan de tous les modules, dates Paris, pagination et export complet', async () => {
  const e = await environment()
  try {
    const { id: residence } = e.sqlite.prepare('SELECT id FROM residences').get() as { id: string }
    const { id: actor } = e.sqlite.prepare('SELECT id FROM users').get() as { id: string }
    const run = (query: string, ...values: (string | number | null)[]) => e.sqlite.prepare(query).run(...values)
    run("INSERT INTO lots(id,residence_id,building_id,number) VALUES('report-lot',?,'test-building','101')", residence)
    run(
      "INSERT INTO cleaning_tasks(id,residence_id,lot_id,agent_id,day,created_by,created_at) VALUES('clean',?,'report-lot',?,'2026-03-20',?,'2026-03-20T09:00:00.000Z')",
      residence,
      actor,
      actor,
    )
    run(
      "INSERT INTO cleaning_task_items(id,residence_id,task_id,kind,label,position,state,note) VALUES('clean-item',?,'clean','check','Mur',0,'issue','Trace')",
      residence,
    )
    run(
      "UPDATE cleaning_tasks SET status='done',completed_at='2026-03-22T23:30:00.000Z',completed_by=?,report='Terminé' WHERE id='clean'",
      actor,
    )
    run(
      "INSERT INTO works(id,residence_id,title,created_by,created_at,state,actual_start,actual_end) VALUES('work',?,'Plomberie',?,'2026-03-20T09:00:00.000Z','done','2026-03-23','2026-03-24')",
      residence,
      actor,
    )
    run(
      "INSERT INTO work_locations(id,residence_id,work_id,lot_id) VALUES('location',?,'work','report-lot')",
      residence,
    )
    run(
      "INSERT INTO work_notes(id,residence_id,work_id,kind,body,actor_id,created_at) VALUES('note',?,'work','problem','Fuite',?,'2026-03-25T12:00:00.000Z')",
      residence,
      actor,
    )
    run(
      "INSERT INTO issues(id,residence_id,title,reported_on,created_by,created_at) VALUES('issue',?,'Robinet','2026-03-23',?,'2026-03-23T09:00:00.000Z')",
      residence,
      actor,
    )
    for (const [id, status] of [
      ['done-intervention', 'done'],
      ['planned-intervention', 'planned'],
      ['cancelled-intervention', 'cancelled'],
    ])
      run(
        "INSERT INTO interventions(id,residence_id,work_id,starts_at,duration,status,created_by,created_at) VALUES(?,?,'work','2026-03-24T09:00:00.000Z',30,?,?,'2026-03-20T09:00:00.000Z')",
        id!,
        residence,
        status!,
        actor,
      )
    run("INSERT INTO stock_items(id,residence_id,name,unit,threshold) VALUES('stock',?,'Linge','pièce',1)", residence)
    run(
      "INSERT INTO stock_movements(id,residence_id,item_id,kind,delta,quantity_after,occurred_on,comment,actor_id,created_at) VALUES('movement',?,'stock','in',3,3,'2026-03-26','Livraison',?,'2026-03-26T09:00:00.000Z')",
      residence,
      actor,
    )
    run(
      "INSERT INTO meters(id,residence_id,name,location,reference,kind,unit) VALUES('meter',?,'Eau','Hall','','water','m3')",
      residence,
    )
    run(
      "INSERT INTO meter_readings(id,residence_id,meter_id,observed_on,value,actor_id) VALUES('reading',?,'meter','2026-03-27',123.5,?)",
      residence,
      actor,
    )
    run(
      "INSERT INTO revenue_sources(id,residence_id,name,vat_mode,vat_rate) VALUES('source',?,'Café','ht',NULL)",
      residence,
    )
    run(
      "INSERT INTO revenue_entries(id,residence_id,source_id,period,amount_cents,vat_mode,net_cents,actor_id,updated_at) VALUES('entry',?,'source','2026-02',1000,'ht',1000,?,'2026-03-28T09:00:00.000Z')",
      residence,
      actor,
    )
    for (const [id, before, amount] of [
      ['entry-first', null, 1000],
      ['entry-correction', '{}', 2000],
    ] as const)
      run(
        "INSERT INTO revenue_entry_changes(id,residence_id,entry_id,actor_id,before_json,after_json,created_at) VALUES(?,?,'entry',?,?,?,'2026-03-28T09:00:00.000Z')",
        id,
        residence,
        actor,
        before,
        JSON.stringify({ period: '2026-02', amount_cents: amount, vat_mode: 'ht', comment: 'Correction' }),
      )
    for (let index = 0; index < 22; index++)
      run(
        "INSERT INTO feedback(id,residence_id,kind,message,author_id,created_at) VALUES(?,?,'idea',?,?, '2026-03-29T21:59:00.000Z')",
        'feedback-' + index,
        residence,
        '=Idée\navec\ttabulation ' + index,
        actor,
      )
    run(
      "INSERT INTO feedback(id,residence_id,kind,message,author_id,created_at) VALUES('outside',?,'bug','Semaine suivante',?,'2026-03-29T22:00:00.000Z')",
      residence,
      actor,
    )
    run(
      "INSERT INTO history(id,residence_id,lot_id,actor_id,action,after_json,created_at) VALUES('lot-history',?,'report-lot',?,'Lot créé','{}','2026-03-23T09:00:00.000Z')",
      residence,
      actor,
    )
    run("UPDATE users SET created_at='2026-03-23T09:00:00.000Z' WHERE id=?", actor)
    const response = await e.request('/reports/weekly?date=2026-03-25&page=1')
    assert.equal(response.status, 200, await response.clone().text())
    const report = (await response.json()) as Report
    const full = (await (await e.request('/reports/weekly?date=2026-03-25')).json()) as Report
    assert.equal(report.total, 34)
    assert.equal(report.rows.length, 20)
    assert.deepEqual(
      new Set(full.rows.map((row) => row.module)),
      new Set(['Ménage', 'Technique', 'Stocks', 'Relevés', 'Prestations', 'Boîte à idées', 'Lots', 'Équipe']),
    )
    assert.equal(full.rows.find((row) => row.module === 'Ménage')?.date, '2026-03-23')
    assert.match(full.rows.find((row) => row.module === 'Ménage')!.comment, /Mur : Trace/)
    assert.equal(full.rows.filter((row) => row.kind === 'Intervention réalisée').length, 1)
    assert.match(full.rows.find((row) => row.kind === 'Travaux terminés')!.subject, /Lot 101/)
    assert.match(full.rows.find((row) => row.module === 'Relevés')!.comment, /123.5 m³/)
    assert.match(full.rows.find((row) => row.kind === 'Chiffre d’affaires corrigé')!.comment, /2026-02 · 20.00 € HT/)
    assert.equal(report.tsv, full.tsv)
    assert.equal(report.tsv.split('\r\n').length, report.total + 1)
    assert.match(report.tsv, /'=Idée avec tabulation/)
    assert.doesNotMatch(report.tsv, /Semaine suivante/)
    const second = (await (await e.request('/reports/weekly?date=2026-03-25&page=2')).json()) as Report
    assert.equal(second.rows.length, 14)
    assert.equal(second.tsv, report.tsv)
    run("UPDATE cleaning_tasks SET status='planned',completed_at=NULL,completed_by=NULL WHERE id='clean'")
    run("UPDATE meter_readings SET observed_on='2026-03-30' WHERE id='reading'")
    const corrected = (await (await e.request('/reports/weekly?date=2026-03-25')).json()) as Report
    assert.equal(corrected.total, 32)
    e.sqlite.exec('PRAGMA ignore_check_constraints=ON')
    run("INSERT INTO residences(id,name,singleton) VALUES('other-residence','Autre résidence',2)")
    e.sqlite.exec('PRAGMA ignore_check_constraints=OFF')
    run(
      "INSERT INTO feedback(id,residence_id,kind,message,author_id,created_at) VALUES('other-feedback','other-residence','bug','Autre résidence',?,'2026-03-25T09:00:00.000Z')",
      actor,
    )
    const isolated = (await (await e.request('/reports/weekly?date=2026-03-25')).json()) as Report
    assert.equal(isolated.total, 32)
    assert.doesNotMatch(isolated.tsv, /Autre résidence/)
    run(
      "INSERT INTO users(id,residence_id,email,name,role,password_hash,salt,created_at) SELECT 'backup-admin',residence_id,'backup@example.test','Autre admin','admin',password_hash,salt,'2026-01-01T00:00:00.000Z' FROM users WHERE id=?",
      actor,
    )
    run("UPDATE users SET role='manager' WHERE id=?", actor)
    const managerReport = (await (await e.request('/reports/weekly?date=2026-03-25')).json()) as Report
    assert.ok(managerReport.rows.every((row) => row.module !== 'Équipe'))
  } finally {
    await e.dispose()
  }
})

test('limitation de connexion, invitation expirée et invalidation à la déconnexion', async () => {
  const e = await environment()
  try {
    for (let index = 0; index < 5; index++)
      assert.equal(
        (await e.request('/auth/login', 'POST', { email: 'absent@example.test', password: 'invalid' }, '')).status,
        401,
      )
    assert.equal(
      (await e.request('/auth/login', 'POST', { email: 'absent@example.test', password: 'invalid' }, '')).status,
      429,
    )
    const { token } = (await (
      await e.request('/team/invitations', 'POST', { email: 'expire@example.test', role: 'manager' })
    ).json()) as { token: string }
    e.sqlite.prepare("UPDATE invitations SET expires_at='2000-01-01'").run()
    assert.equal((await e.request('/auth/invitations/' + token, 'GET', undefined, '')).status, 404)
    await e.request('/auth/logout', 'POST')
    assert.equal((await e.request('/lots')).status, 401)
  } finally {
    await e.dispose()
  }
})

test('un départ prévu passé ne libère pas l’occupation réelle', async () => {
  const e = await environment()
  try {
    await e.request('/lots', 'POST', { building_id: 'test-building', number: '102', floor: '', type: '' })
    const lotId = (e.sqlite.prepare('SELECT id FROM lots').get() as { id: string }).id
    const create = (first: string, start: string, end: string) =>
      e.request('/lots/' + lotId + '/stays', 'POST', {
        first_name: first,
        last_name: 'Test',
        planned_start: start,
        planned_end: end,
      })
    await create('Premier', '2026-01-01', '2026-02-01')
    const first = (e.sqlite.prepare('SELECT id FROM stays').get() as { id: string }).id
    await e.request('/stays/' + first + '/actions', 'POST', { action: 'entry', date: '2026-01-01' })
    await create('Second', '2026-02-01', '2026-03-01')
    const second = (e.sqlite.prepare('SELECT id FROM stays WHERE id<>?').get(first) as { id: string }).id
    assert.equal(
      (await e.request('/stays/' + second + '/actions', 'POST', { action: 'entry', date: '2026-02-01' })).status,
      409,
    )
    assert.equal(
      (await e.request('/stays/' + first + '/actions', 'POST', { action: 'exit', date: '2026-02-01' })).status,
      200,
    )
    assert.equal(
      (await e.request('/stays/' + second + '/actions', 'POST', { action: 'entry', date: '2026-02-01' })).status,
      200,
    )
  } finally {
    await e.dispose()
  }
})

test('liste paginée, recherche littérale, calendrier à minuit et séjour annulé', async () => {
  const e = await environment()
  try {
    for (let index = 0; index < 23; index++)
      await e.request('/lots', 'POST', {
        building_id: 'test-building',
        number: String(100 + index),
        floor: index < 10 ? '1' : '2',
        type: index === 0 ? '100% studio' : 'Studio',
      })
    const page = (await (await e.request('/lots?page=2&sort=floor')).json()) as { items: unknown[]; total: number }
    assert.equal(page.items.length, 3)
    assert.equal(page.total, 23)
    const literal = (await (await e.request('/lots?q=%25')).json()) as { total: number }
    assert.equal(literal.total, 1)
    assert.equal((await e.request('/lots?page=0')).status, 400)
    const lotId = (e.sqlite.prepare("SELECT id FROM lots WHERE number='100'").get() as { id: string }).id
    await e.request('/lots/' + lotId + '/stays', 'POST', {
      first_name: 'Test',
      last_name: 'Test',
      planned_start: '2026-03-01',
      planned_end: null,
    })
    const sid = (e.sqlite.prepare('SELECT id FROM stays').get() as { id: string }).id
    const payload = {
      kind: 'entry',
      local_start: '2026-03-29T00:15',
      duration: 30,
      status: 'planned',
      completed_on: null,
      comment: '',
    }
    await e.request('/stays/' + sid + '/inspections', 'POST', payload)
    const iid = (e.sqlite.prepare('SELECT id FROM inspections').get() as { id: string }).id
    const calendar = (await (await e.request('/calendar?from=2026-03-29&to=2026-03-29')).json()) as { time: string }[]
    assert.equal(calendar.length, 1)
    assert.equal(calendar[0]!.time, '00:15')
    assert.equal(
      (await e.request('/inspections/' + iid, 'PATCH', { ...payload, local_start: '2026-03-30T13:00' })).status,
      200,
    )
    assert.equal(((await (await e.request('/calendar?from=2026-03-29&to=2026-03-29')).json()) as unknown[]).length, 0)
    assert.equal(
      (await e.request('/stays/' + sid + '/actions', 'POST', { action: 'cancel', date: '2026-03-01' })).status,
      200,
    )
    assert.equal(((await (await e.request('/calendar?from=2026-03-30&to=2026-03-30')).json()) as unknown[]).length, 0)
    assert.equal((e.sqlite.prepare('SELECT status FROM inspections').get() as { status: string }).status, 'cancelled')
  } finally {
    await e.dispose()
  }
})

test('bâtiments de résidence, affectation unique et conservation des lots', async () => {
  const e = await environment()
  try {
    e.sqlite.prepare('DELETE FROM buildings').run()
    assert.equal((await e.request('/buildings', 'GET', undefined, '')).status, 401)
    assert.equal((await e.request('/buildings', 'POST', { name: '  ' })).status, 400)
    assert.equal((await e.request('/buildings', 'POST', { name: ' Bâtiment A ' })).status, 200)
    assert.equal((await e.request('/buildings', 'POST', { name: 'bâtiment A' })).status, 409)
    assert.equal((await e.request('/buildings', 'POST', { name: 'Bâtiment B' })).status, 200)
    const buildings = (await (await e.request('/buildings')).json()) as { id: string; name: string }[]
    assert.deepEqual(
      buildings.map((item) => item.name),
      ['Bâtiment A', 'Bâtiment B'],
    )
    const a = buildings[0]!.id,
      b = buildings[1]!.id
    const input = { number: '101', floor: '1', type: 'Studio', building_id: a }
    const { building_id: ignoredBuilding, ...missingBuilding } = input
    assert.ok(ignoredBuilding)
    assert.equal((await e.request('/lots', 'POST', missingBuilding)).status, 400)
    assert.equal((await e.request('/lots', 'POST', { ...input, building_id: null })).status, 400)
    assert.equal((await e.request('/lots', 'POST', { ...input, building_id: '' })).status, 400)
    assert.equal((await e.request('/lots', 'POST', input)).status, 200)
    const id = (e.sqlite.prepare('SELECT id FROM lots').get() as { id: string }).id
    const detail = async () =>
      (await (await e.request('/lots/' + id)).json()) as {
        lot: { building_id: string; building_name: string }
        history: unknown[]
      }
    assert.equal((await detail()).lot.building_id, a)
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: a })).status, 200)
    assert.equal((await detail()).lot.building_name, 'Bâtiment A')
    assert.equal((await e.request('/lots/' + id, 'PATCH', missingBuilding)).status, 400)
    assert.equal((await detail()).lot.building_id, a)
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: [a, b] })).status, 400)
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: 'absent' })).status, 404)
    assert.equal((await detail()).lot.building_id, a)
    const residenceId = (e.sqlite.prepare('SELECT id FROM residences').get() as { id: string }).id
    e.sqlite.exec('PRAGMA foreign_keys=OFF')
    e.sqlite
      .prepare('INSERT INTO buildings(id,residence_id,name) VALUES(?,?,?)')
      .run('foreign', 'other', 'Autre résidence')
    e.sqlite.exec('PRAGMA foreign_keys=ON')
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: 'foreign' })).status, 404)
    assert.equal(((await (await e.request('/buildings')).json()) as unknown[]).length, 2)
    assert.throws(
      () => e.sqlite.prepare('UPDATE lots SET building_id=? WHERE id=?').run('foreign', id),
      /building_scope/,
    )
    assert.throws(
      () =>
        e.sqlite
          .prepare('INSERT INTO lots(id,residence_id,number,building_id) VALUES(?,?,?,?)')
          .run('bad', residenceId, 'bad', 'foreign'),
      /building_scope/,
    )
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: b })).status, 200)
    assert.equal((await detail()).lot.building_id, b)
    const count = async (filter: string) =>
      ((await (await e.request('/lots?building=' + filter)).json()) as { total: number }).total
    assert.equal(await count(a), 0)
    assert.equal(await count(b), 1)
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: null })).status, 400)
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: '' })).status, 400)
    assert.equal((await detail()).lot.building_id, b)
    assert.throws(() => e.sqlite.prepare('UPDATE lots SET building_id=NULL WHERE id=?').run(id), /building_required/)
    assert.throws(
      () =>
        e.sqlite
          .prepare('INSERT INTO lots(id,residence_id,number) VALUES(?,?,?)')
          .run('missing', residenceId, 'missing'),
      /building_required/,
    )
    assert.ok((await detail()).history.length >= 3)
    const { token } = (await (
      await e.request('/team/invitations', 'POST', { email: 'buildings-cleaner@example.test', role: 'cleaner' })
    ).json()) as { token: string }
    const accept = await e.request(
      '/auth/invitations/' + token,
      'POST',
      { name: 'Agent', password: 'Validation-seulement-2026' },
      '',
    )
    const cleaner = accept.headers.get('set-cookie')!.split(';')[0]!
    assert.equal((await e.request('/buildings', 'GET', undefined, cleaner)).status, 200)
    assert.equal((await e.request('/buildings', 'POST', { name: 'Interdit' }, cleaner)).status, 403)
    assert.equal((await e.request('/lots/' + id, 'PATCH', { ...input, building_id: a }, cleaner)).status, 403)
  } finally {
    await e.dispose()
  }
})

test('compteurs des communs : index datés, mois suivi, corrections et isolation', async () => {
  const e = await environment()
  try {
    assert.equal((await e.request('/meters?month=2026-09', 'GET', undefined, '')).status, 401)
    const input = {
      name: 'Eau des communs',
      location: 'Local technique',
      reference: 'EAU-01',
      kind: 'water',
      unit: 'm3',
    }
    assert.equal((await e.request('/meters', 'POST', { ...input, unit: 'kWh' })).status, 400)
    assert.equal((await e.request('/meters', 'POST', input)).status, 200)
    assert.equal((await e.request('/meters', 'POST', input)).status, 409)
    let list = (await (await e.request('/meters?month=2026-09')).json()) as {
      items: { id: string; latest_value: number | null; latest_date: string | null; month_date: string | null }[]
      total: number
    }
    const id = list.items[0]!.id
    assert.equal(list.items[0]!.latest_value, null)
    assert.equal(((await (await e.request('/meters?month=2026-09&pending=true')).json()) as typeof list).total, 1)
    const path = '/meters/' + id + '/readings'
    for (const observed_on of ['2026-02-30', '2999-01-01'])
      assert.equal((await e.request(path, 'POST', { observed_on, value: 10 })).status, 400)
    assert.equal((await e.request(path, 'POST', { observed_on: '2026-09-01', value: -1 })).status, 400)
    assert.equal((await e.request(path, 'POST', { observed_on: '2026-09-01', value: 0 })).status, 200)
    assert.equal((await e.request(path, 'POST', { observed_on: '2026-09-01', value: 12 })).status, 409)
    assert.equal((await e.request(path, 'POST', { observed_on: '2026-09-30', value: 125.75 })).status, 200)
    assert.equal((await e.request(path, 'POST', { observed_on: '2026-08-31', value: 95 })).status, 200)
    list = (await (await e.request('/meters?month=2026-09')).json()) as typeof list
    assert.equal(list.items[0]!.latest_value, 125.75)
    assert.equal(list.items[0]!.latest_date, '2026-09-30')
    assert.equal(list.items[0]!.month_date, '2026-09-30')
    assert.equal(((await (await e.request('/meters?month=2026-09&pending=true')).json()) as typeof list).total, 0)
    assert.equal(((await (await e.request('/meters?month=2026-10&pending=true')).json()) as typeof list).total, 1)
    let history = (await (await e.request(path)).json()) as {
      items: { id: string; observed_on: string; value: number }[]
      total: number
    }
    assert.deepEqual(
      history.items.map((row) => row.value),
      [125.75, 0, 95],
    )
    const readingId = history.items[0]!.id
    assert.equal(
      (await e.request(path + '/' + readingId, 'PATCH', { observed_on: '2026-09-29', value: 126.5 })).status,
      200,
    )
    assert.equal(
      (await e.request(path + '/' + readingId, 'PATCH', { observed_on: '2026-09-01', value: 50 })).status,
      409,
    )
    history = (await (await e.request(path)).json()) as typeof history
    assert.equal(history.items[0]!.value, 126.5)
    assert.equal(history.total, 3)
    assert.equal((e.sqlite.prepare('SELECT COUNT(*) AS n FROM meter_reading_changes').get() as { n: number }).n, 4)
    const consumption = (await (await e.request('/meters/' + id + '/consumption?year=2026')).json()) as {
      total: number
      months: { month: string; value: number | null; reset: boolean }[]
    }
    assert.equal(consumption.months[7]!.value, null)
    assert.equal(consumption.months[8]!.value, null)
    assert.equal(consumption.months[8]!.reset, true)
    assert.equal(consumption.total, 0)
    assert.equal(
      (await e.request(path + '/' + history.items[1]!.id, 'PATCH', { observed_on: '2026-09-01', value: 100 })).status,
      200,
    )
    const corrected = (await (await e.request('/meters/' + id + '/consumption?year=2026')).json()) as typeof consumption
    assert.equal(corrected.months[8]!.value, 31.5)
    assert.equal(corrected.total, 31.5)
    assert.equal((await e.request('/meters/' + id + '/consumption?year=1999')).status, 400)
    assert.equal((await e.request('/meters/' + id + '/consumption?year=abc')).status, 400)
    assert.equal((await e.request('/meters?month=2026-13')).status, 400)
    assert.equal((await e.request(path + '?page=0')).status, 400)
    assert.equal((await e.request(path + '?page=2')).status, 200)
    assert.deepEqual(((await (await e.request(path + '?page=2')).json()) as typeof history).items, [])
    assert.equal(
      (await e.request(path, 'POST', { observed_on: '2026-09-02', value: 1 }, e.cookie, 'https://autre.example'))
        .status,
      403,
    )
    e.sqlite.exec('PRAGMA foreign_keys=OFF')
    e.sqlite
      .prepare(
        "INSERT INTO meters(id,residence_id,name,location,reference,kind,unit) VALUES('foreign-meter','other-meter-residence','Autre','Commun','', 'gas','m3')",
      )
      .run()
    e.sqlite.exec('PRAGMA foreign_keys=ON')
    assert.equal((await e.request('/meters/foreign-meter')).status, 404)
    const meter = (await (await e.request('/meters/' + id)).json()) as { name: string; latest_value: number }
    assert.deepEqual([meter.name, meter.latest_value], ['Eau des communs', 126.5])
    assert.equal((await e.request('/meters/foreign-meter/readings')).status, 404)
    assert.equal((await e.request('/meters/foreign-meter/consumption?year=2026')).status, 404)
    assert.equal(
      (await e.request('/meters/foreign-meter/readings', 'POST', { observed_on: '2026-09-02', value: 1 })).status,
      404,
    )
    assert.equal(
      (await e.request('/meters/foreign-meter/readings/' + readingId, 'PATCH', { observed_on: '2026-09-02', value: 1 }))
        .status,
      404,
    )
    list = (await (await e.request('/meters?month=2026-09')).json()) as typeof list
    assert.equal(list.total, 1)
    const invite = (await (
      await e.request('/team/invitations', 'POST', { email: 'meter-cleaner@example.test', role: 'cleaner' })
    ).json()) as { token: string }
    const accepted = await e.request(
      '/auth/invitations/' + invite.token,
      'POST',
      { name: 'Ménage', password: 'Validation-seulement-2026' },
      '',
    )
    const cleaner = accepted.headers.get('set-cookie')!.split(';')[0]!
    assert.equal((await e.request('/meters?month=2026-09', 'GET', undefined, cleaner)).status, 403)
    assert.equal((await e.request(path, 'GET', undefined, cleaner)).status, 403)
    assert.equal((await e.request('/meters/' + id, 'GET', undefined, cleaner)).status, 403)
    assert.equal((await e.request('/meters', 'POST', { ...input, name: 'Interdit' }, cleaner)).status, 403)
    assert.equal((await e.request(path, 'POST', { observed_on: '2026-09-02', value: 1 }, cleaner)).status, 403)
    assert.equal(
      (await e.request(path + '/' + readingId, 'PATCH', { observed_on: '2026-09-02', value: 1 }, cleaner)).status,
      403,
    )
  } finally {
    await e.dispose()
  }
})

test('stocks : articles libres, mouvements, inventaire, stocks faibles et isolation', async () => {
  const e = await environment()
  try {
    assert.equal((await e.request('/stock', 'GET', undefined, '')).status, 401)
    const couette = {
      name: 'Couette',
      categories: ['Literie', 'Stock commun', 'stock commun '],
      unit: 'pièces',
      threshold: 3,
      initial: 5,
    }
    assert.equal((await e.request('/stock', 'POST', { ...couette, name: ' ' })).status, 400)
    assert.equal((await e.request('/stock', 'POST', { ...couette, threshold: 1.5 })).status, 400)
    assert.equal((await e.request('/stock', 'POST', couette)).status, 200)
    assert.equal((await e.request('/stock', 'POST', { ...couette, name: 'couette' })).status, 409)
    assert.equal(
      (
        await e.request('/stock', 'POST', {
          name: 'Brosse à toilette',
          categories: ['Hygiène', 'Stock Coworking', 'Stock commun'],
          unit: '',
          threshold: 2,
          initial: 0,
        })
      ).status,
      200,
    )
    assert.equal(
      (await e.request('/stock', 'POST', { name: 'Tabouret', categories: [], unit: '', threshold: 0, initial: 4 }))
        .status,
      200,
    )
    type Page = {
      items: { id: string; name: string; categories: string[]; quantity: number; level: string }[]
      total: number
      low: number
      categories: { id: string; name: string }[]
      views: { id: string; name: string; categories: string[]; low: number }[]
    }
    let list = (await (await e.request('/stock')).json()) as Page
    assert.deepEqual(
      list.items.map((item) => [item.name, item.quantity, item.level]),
      [
        ['Brosse à toilette', 0, 'out'],
        ['Couette', 5, 'ok'],
        ['Tabouret', 4, 'ok'],
      ],
    )
    assert.equal(list.low, 1)
    assert.deepEqual(
      list.categories.map((category) => category.name),
      ['Hygiène', 'Literie', 'Stock commun', 'Stock Coworking'],
    )
    assert.deepEqual(
      list.items.map((item) => item.categories),
      [['Hygiène', 'Stock commun', 'Stock Coworking'], ['Literie', 'Stock commun'], []],
    )
    const categoryId = (name: string) => list.categories.find((category) => category.name === name)!.id
    const common = categoryId('Stock commun'),
      coworking = categoryId('Stock Coworking'),
      hygiene = categoryId('Hygiène')
    let filtered = (await (await e.request('/stock?category=' + common)).json()) as Page
    assert.deepEqual(
      filtered.items.map((item) => item.name),
      ['Brosse à toilette', 'Couette'],
    )
    assert.equal(filtered.low, 1)
    filtered = (await (await e.request('/stock?category=' + coworking)).json()) as Page
    assert.deepEqual(
      filtered.items.map((item) => item.name),
      ['Brosse à toilette'],
    )
    filtered = (await (await e.request('/stock?q=cowork')).json()) as Page
    assert.equal(filtered.total, 1)
    filtered = (await (await e.request('/stock?q=HYGIENE')).json()) as Page
    assert.deepEqual(
      filtered.items.map((item) => item.name),
      ['Brosse à toilette'],
    )
    filtered = (await (await e.request('/stock?q=' + encodeURIComponent('brosse á'))).json()) as Page
    assert.equal(filtered.total, 1)
    const view = { name: 'Coworking', categories: [coworking, categoryId('Literie')] }
    assert.equal((await e.request('/stock/views', 'POST', { ...view, categories: [] })).status, 400)
    assert.equal((await e.request('/stock/views', 'POST', { ...view, categories: ['foreign'] })).status, 404)
    assert.equal((await e.request('/stock/views', 'POST', view)).status, 200)
    assert.equal((await e.request('/stock/views', 'POST', { ...view, name: 'coworking' })).status, 409)
    assert.equal((await e.request('/stock/views', 'POST', { name: 'Commun', categories: [common] })).status, 200)
    filtered = (await (await e.request('/stock')).json()) as Page
    assert.deepEqual(
      filtered.views.map((item) => [item.name, item.categories.length, item.low]),
      [
        ['Commun', 1, 1],
        ['Coworking', 2, 1],
      ],
    )
    const coworkingView = filtered.views.find((item) => item.name === 'Coworking')!.id
    filtered = (await (await e.request('/stock?view=' + coworkingView)).json()) as Page
    assert.deepEqual(
      filtered.items.map((item) => item.name),
      ['Brosse à toilette', 'Couette'],
    )
    assert.equal(filtered.low, 1)
    filtered = (await (await e.request('/stock?view=' + coworkingView + '&category=' + hygiene)).json()) as Page
    assert.deepEqual(
      filtered.items.map((item) => item.name),
      ['Brosse à toilette'],
    )
    assert.equal(
      (await e.request('/stock/views/' + coworkingView, 'PATCH', { name: 'Coworking', categories: [coworking] }))
        .status,
      200,
    )
    filtered = (await (await e.request('/stock?view=' + coworkingView)).json()) as Page
    assert.equal(filtered.total, 1)
    for (let index = 0; index < 6; index++)
      assert.equal(
        (await e.request('/stock/views', 'POST', { name: 'Vue ' + index, categories: [common] })).status,
        200,
      )
    assert.equal((await e.request('/stock/views', 'POST', { name: 'Vue 9', categories: [common] })).status, 400)
    assert.equal((await e.request('/stock/views/foreign', 'DELETE')).status, 404)
    assert.equal((await e.request('/stock/views/' + coworkingView, 'DELETE')).status, 200)
    filtered = (await (await e.request('/stock')).json()) as Page
    assert.equal(filtered.views.length, 7)
    assert.equal((await e.request('/stock', 'POST', { ...couette, name: 'Vide', categories: [' '] })).status, 400)
    const id = list.items.find((item) => item.name === 'Couette')!.id
    const path = '/stock/' + id + '/movements'
    const move = (kind: string, quantity: number, occurred_on = '2026-09-10') =>
      e.request(path, 'POST', { kind, quantity, occurred_on, comment: '' })
    assert.equal((await move('out', 0)).status, 400)
    assert.equal((await move('out', 1, '2999-01-01')).status, 400)
    assert.equal((await move('out', 6)).status, 409)
    assert.equal((await move('out', 2)).status, 200)
    list = (await (await e.request('/stock?level=alert')).json()) as Page
    assert.deepEqual(
      list.items.map((item) => [item.name, item.quantity, item.level]),
      [
        ['Brosse à toilette', 0, 'out'],
        ['Couette', 3, 'low'],
      ],
    )
    assert.equal(list.low, 2)
    assert.equal((await move('in', 10)).status, 200)
    assert.equal((await move('count', 11)).status, 400)
    assert.equal((await move('count', 11, today())).status, 200)
    assert.equal((await move('count', 11, today())).status, 200)
    const history = (await (await e.request(path)).json()) as {
      items: { kind: string; delta: number; quantity_after: number }[]
      total: number
    }
    assert.deepEqual(
      history.items.map((row) => [row.kind, row.delta, row.quantity_after]),
      [
        ['count', 0, 11],
        ['count', -2, 11],
        ['in', 10, 13],
        ['out', -2, 3],
        ['count', 5, 5],
      ],
    )
    const trend = (await (await e.request('/stock/' + id + '/trend?year=2026')).json()) as {
      entries: number
      exits: number
      months: { month: string; entries: number; exits: number }[]
    }
    assert.deepEqual([trend.entries, trend.exits, trend.months.length], [10, 2, 12])
    assert.deepEqual(trend.months[8], { ...trend.months[8], month: '2026-09', entries: 10, exits: 2 })
    assert.equal((await e.request('/stock/' + id + '/trend?year=abc')).status, 400)
    assert.equal((await e.request('/stock/foreign-item/trend?year=2026')).status, 404)
    assert.equal(
      (
        await e.request('/stock/' + id, 'PATCH', {
          name: 'Couette 140',
          categories: ['Literie'],
          unit: '',
          threshold: 12,
        })
      ).status,
      200,
    )
    list = (await (await e.request('/stock?q=140')).json()) as Page
    assert.deepEqual(
      list.items.map((item) => [item.name, item.level]),
      [['Couette 140', 'low']],
    )
    assert.deepEqual(list.items[0]!.categories, ['Literie'])
    const detail = (await (await e.request('/stock/' + id)).json()) as Page['items'][number] & { threshold: number }
    assert.deepEqual(
      [detail.name, detail.quantity, detail.threshold, detail.level, detail.categories],
      ['Couette 140', 11, 12, 'low', ['Literie']],
    )
    list = (await (await e.request('/stock?category=' + hygiene)).json()) as Page
    assert.equal(list.total, 1)
    list = (await (await e.request('/stock?category=' + common)).json()) as Page
    assert.equal(list.total, 1)
    assert.equal((await e.request('/stock?level=autre')).status, 400)
    assert.equal((e.sqlite.prepare('SELECT COUNT(*) AS n FROM stock_item_changes').get() as { n: number }).n, 4)
    e.sqlite.exec('PRAGMA foreign_keys=OFF')
    e.sqlite
      .prepare(
        "INSERT INTO stock_items(id,residence_id,name,unit,threshold,quantity) VALUES('foreign-item','other','Autre','',0,9)",
      )
      .run()
    e.sqlite.exec('PRAGMA foreign_keys=ON')
    assert.equal((await e.request('/stock/foreign-item')).status, 404)
    assert.equal((await e.request('/stock/foreign-item/movements')).status, 404)
    assert.equal(
      (
        await e.request('/stock/foreign-item/movements', 'POST', {
          kind: 'out',
          quantity: 1,
          occurred_on: '2026-09-10',
          comment: '',
        })
      ).status,
      404,
    )
    assert.equal(
      (await e.request('/stock/foreign-item', 'PATCH', { name: 'X', categories: [], unit: '', threshold: 0 })).status,
      404,
    )
    assert.equal(((await (await e.request('/stock')).json()) as Page).total, 3)
    const invite = (await (
      await e.request('/team/invitations', 'POST', { email: 'stock-cleaner@example.test', role: 'cleaner' })
    ).json()) as { token: string }
    const accepted = await e.request(
      '/auth/invitations/' + invite.token,
      'POST',
      { name: 'Ménage', password: 'Validation-seulement-2026' },
      '',
    )
    const cleaner = accepted.headers.get('set-cookie')!.split(';')[0]!
    assert.equal((await e.request('/stock', 'GET', undefined, cleaner)).status, 403)
    assert.equal((await e.request('/stock/views', 'POST', { name: 'X', categories: [] }, cleaner)).status, 403)
    assert.equal((await e.request('/stock/' + id, 'GET', undefined, cleaner)).status, 403)
    assert.equal((await e.request('/stock/' + id, 'DELETE', undefined, cleaner)).status, 403)
    assert.equal((await e.request('/stock/foreign-item', 'DELETE')).status, 404)
    assert.equal((await e.request('/stock/' + id, 'DELETE', undefined, e.cookie, 'https://autre.example')).status, 403)
    assert.equal((await e.request('/stock/' + id, 'DELETE')).status, 200)
    assert.equal((await e.request('/stock/' + id, 'DELETE')).status, 404)
    assert.equal((await e.request(path)).status, 404)
    list = (await (await e.request('/stock')).json()) as Page
    assert.deepEqual(
      list.items.map((item) => item.name),
      ['Brosse à toilette', 'Tabouret'],
    )
    assert.deepEqual(
      list.categories.map((category) => category.name),
      ['Hygiène', 'Stock commun', 'Stock Coworking'],
    )
    assert.equal(
      (e.sqlite.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE item_id=?').get(id) as { n: number }).n,
      0,
    )
    assert.equal((await e.request('/stock', 'POST', { ...couette, initial: 0 })).status, 200)
    assert.equal(
      (await e.request(path, 'POST', { kind: 'in', quantity: 1, occurred_on: '2026-09-10', comment: '' }, cleaner))
        .status,
      403,
    )
  } finally {
    await e.dispose()
  }
})

test('ménage : fiches, planning, checklist, réalisation par l’agent et isolation', async () => {
  const e = await environment()
  try {
    for (const number of ['101', '102', '103'])
      assert.equal(
        (await e.request('/lots', 'POST', { building_id: 'test-building', number, floor: '1', type: '' })).status,
        200,
      )
    const lots = Object.fromEntries(
      (e.sqlite.prepare('SELECT id,number FROM lots').all() as { id: string; number: string }[]).map((row) => [
        row.number,
        row.id,
      ]),
    ) as Record<string, string>
    const invite = await e.request('/team/invitations', 'POST', { email: 'agent@example.test', role: 'cleaner' })
    const { token } = (await invite.json()) as { token: string }
    const accept = await e.request(
      '/auth/invitations/' + token,
      'POST',
      { name: 'Agent', password: 'Validation-seulement-2026' },
      '',
    )
    const cleaner = accept.headers.get('set-cookie')!.split(';')[0]!
    const agentId = ((await accept.json()) as { id: string }).id
    const adminId = (e.sqlite.prepare("SELECT id FROM users WHERE role='admin'").get() as { id: string }).id

    assert.equal((await e.request('/cleaning/templates', 'GET', undefined, cleaner)).status, 403)
    const standard = await e.request('/cleaning/templates', 'POST', {
      name: 'Ménage standard',
      is_default: true,
      items: [
        { kind: 'task', label: 'Aspirer les sols' },
        { kind: 'check', label: 'Ampoules fonctionnelles' },
      ],
      lot_ids: [],
    })
    assert.equal(standard.status, 200)
    const standardId = ((await standard.json()) as { id: string }).id
    const deep = await e.request('/cleaning/templates', 'POST', {
      name: 'Remise en état',
      is_default: true,
      items: [{ kind: 'task', label: 'Nettoyer le four' }],
      lot_ids: [lots['102']],
    })
    const deepId = ((await deep.json()) as { id: string }).id
    assert.equal(
      (
        await e.request('/cleaning/templates', 'POST', {
          name: 'ménage STANDARD',
          is_default: false,
          items: [],
          lot_ids: [],
        })
      ).status,
      409,
    )
    assert.equal(
      (
        await e.request('/cleaning/templates/' + standardId, 'PUT', {
          name: 'Ménage standard',
          is_default: true,
          items: [
            { kind: 'task', label: 'Aspirer les sols' },
            { kind: 'check', label: 'Ampoules fonctionnelles' },
          ],
          lot_ids: [],
        })
      ).status,
      200,
    )
    const templates = (await (await e.request('/cleaning/templates')).json()) as {
      id: string
      is_default: boolean
      lot_ids: string[]
    }[]
    assert.deepEqual(
      templates.map((t) => [t.id, t.is_default]),
      [
        [standardId, true],
        [deepId, false],
      ],
    )

    const plan = await e.request('/cleaning/tasks', 'POST', {
      lot_ids: [lots['101'], lots['102']],
      agent_id: agentId,
      day: '2026-10-12',
      template_id: '',
      note: 'Clés à l’accueil',
    })
    assert.equal(plan.status, 200, await plan.clone().text())
    assert.equal(
      (
        await e.request('/cleaning/tasks', 'POST', {
          lot_ids: [lots['101']],
          agent_id: agentId,
          day: '2026-10-12',
          template_id: 'none',
          note: '',
        })
      ).status,
      409,
    )
    assert.equal(
      (
        await e.request('/cleaning/tasks', 'POST', {
          lot_ids: [lots['103']],
          agent_id: adminId,
          day: '2026-10-13',
          template_id: 'none',
          note: '',
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await e.request('/cleaning/tasks', 'POST', {
          lot_ids: [lots['103']],
          agent_id: 'inconnu',
          day: '2026-10-14',
          template_id: 'none',
          note: '',
        })
      ).status,
      400,
    )

    const week = '/cleaning/tasks?from=2026-10-12&to=2026-10-18'
    const all = (await (await e.request(week)).json()) as {
      id: string
      lot_number: string
      template_name: string
      total: number
    }[]
    assert.deepEqual(
      all.map((t) => [t.lot_number, t.template_name, t.total]),
      [
        ['101', 'Ménage standard', 2],
        ['102', 'Remise en état', 1],
        ['103', '', 0],
      ],
    )
    const mine = (await (await e.request(week, 'GET', undefined, cleaner)).json()) as { id: string }[]
    assert.equal(mine.length, 2)
    const other = all.find((t) => t.lot_number === '103')!.id
    assert.equal((await e.request('/cleaning/tasks/' + other, 'GET', undefined, cleaner)).status, 404)
    assert.equal((await e.request('/cleaning/tasks?from=2026-01-01&to=2026-12-31')).status, 400)
    await e.request('/cleaning/tasks', 'POST', {
      lot_ids: [lots['103']],
      agent_id: agentId,
      day: '2026-11-20',
      template_id: 'none',
      note: '',
    })
    const lotHistory = (await (await e.request('/cleaning/lots/' + lots['103'] + '/tasks')).json()) as {
      items: { day: string; agent_name: string }[]
      total: number
    }
    assert.equal(lotHistory.total, 2)
    assert.deepEqual(
      lotHistory.items.map((t) => t.day),
      ['2026-11-20', '2026-10-13'],
    )
    const cleanerHistory = (await (
      await e.request('/cleaning/lots/' + lots['103'] + '/tasks', 'GET', undefined, cleaner)
    ).json()) as { items: { day: string }[]; total: number }
    assert.deepEqual([cleanerHistory.total, cleanerHistory.items.map((t) => t.day)], [1, ['2026-11-20']])

    const taskId = all.find((t) => t.lot_number === '101')!.id
    const detail = (await (await e.request('/cleaning/tasks/' + taskId, 'GET', undefined, cleaner)).json()) as {
      task: { note: string }
      items: { id: string; kind: string; state: string }[]
    }
    assert.equal(detail.task.note, 'Clés à l’accueil')
    assert.deepEqual(
      detail.items.map((i) => i.kind),
      ['task', 'check'],
    )
    const finish = () =>
      e.request('/cleaning/tasks/' + taskId + '/status', 'POST', { status: 'done', report: 'RAS' }, cleaner)
    assert.equal((await finish()).status, 409)
    assert.equal(
      (await e.request('/cleaning/tasks/' + taskId + '/status', 'POST', { status: 'cancelled', report: '' }, cleaner))
        .status,
      403,
    )
    assert.equal(
      (await e.request('/cleaning/tasks/' + taskId + '/items', 'POST', { kind: 'task', label: 'Vitres' }, cleaner))
        .status,
      403,
    )
    assert.equal(
      (await e.request('/cleaning/items/' + detail.items[0]!.id, 'PATCH', { state: 'done', note: '' }, cleaner)).status,
      200,
    )
    assert.equal(
      (
        await e.request(
          '/cleaning/items/' + detail.items[1]!.id,
          'PATCH',
          { state: 'issue', note: 'Ampoule salle de bain' },
          cleaner,
        )
      ).status,
      200,
    )
    assert.equal((await finish()).status, 200)
    assert.equal(
      (await e.request('/cleaning/items/' + detail.items[0]!.id, 'PATCH', { state: 'todo', note: '' }, cleaner)).status,
      409,
    )
    const done = (await (await e.request('/cleaning/tasks/' + taskId)).json()) as {
      task: { status: string; completed_by: string; handled: number; issues: number; report: string }
      items: { note: string; updated_by: string }[]
    }
    assert.deepEqual(
      [done.task.status, done.task.completed_by, done.task.handled, done.task.issues, done.task.report],
      ['done', 'Agent', 2, 1, 'RAS'],
    )
    assert.equal(done.items[1]!.note, 'Ampoule salle de bain')
    const listed = (await (await e.request(week)).json()) as { id: string; remarks: string[] }[]
    assert.deepEqual(listed.find((t) => t.id === taskId)!.remarks, ['Ampoules fonctionnelles : Ampoule salle de bain'])
    assert.equal(
      (await e.request('/cleaning/tasks/' + taskId, 'PATCH', { agent_id: agentId, day: '2026-10-13', note: '' }))
        .status,
      409,
    )
    assert.equal(
      (await e.request('/cleaning/tasks/' + taskId + '/status', 'POST', { status: 'planned', report: '' })).status,
      200,
    )
    assert.equal(
      (await e.request('/cleaning/tasks/' + taskId, 'PATCH', { agent_id: adminId, day: '2026-10-13', note: '' }))
        .status,
      200,
    )
    assert.equal((await e.request('/cleaning/tasks/' + taskId, 'GET', undefined, cleaner)).status, 404)

    const group = all.filter((t) => t.lot_number !== '101').map((t) => t.id)
    const reschedule = (task_ids: string[], day: string, as = e.cookie) =>
      e.request('/cleaning/tasks/reschedule', 'POST', { task_ids, day }, as)
    assert.equal((await reschedule(group, '2026-10-14', cleaner)).status, 403)
    assert.equal((await reschedule([], '2026-10-14')).status, 400)
    assert.equal((await reschedule(group, '2026-10-14')).status, 200)
    const moved = (await (await e.request(week)).json()) as { id: string; day: string }[]
    assert.deepEqual(
      group.map((id) => moved.find((t) => t.id === id)!.day),
      ['2026-10-14', '2026-10-14'],
    )
    assert.equal(
      (
        await e.request('/cleaning/tasks', 'POST', {
          lot_ids: [lots['102']],
          agent_id: agentId,
          day: '2026-10-15',
          template_id: 'none',
          note: '',
        })
      ).status,
      200,
    )
    assert.equal((await reschedule(group, '2026-10-15')).status, 409)
    assert.equal(
      ((await (await e.request('/cleaning/tasks/' + group[1])).json()) as { task: { day: string } }).task.day,
      '2026-10-14',
    )
    assert.equal(
      (await e.request('/cleaning/tasks/' + group[1] + '/status', 'POST', { status: 'cancelled', report: '' })).status,
      200,
    )
    assert.equal((await reschedule(group, '2026-10-16')).status, 409)
    assert.equal((await e.request('/cleaning/templates/' + standardId, 'DELETE')).status, 200)
    const remaining = (await (await e.request('/cleaning/tasks/' + taskId)).json()) as { items: unknown[] }
    assert.equal(remaining.items.length, 2)
  } finally {
    await e.dispose()
  }
})

test('priorités ménage : création multiple, filtre agent, correction, report et clôture', async () => {
  const e = await environment()
  try {
    const invite = await e.request('/team/invitations', 'POST', { email: 'priorite@example.test', role: 'cleaner' })
    const { token } = (await invite.json()) as { token: string }
    const accept = await e.request(
      '/auth/invitations/' + token,
      'POST',
      { name: 'Agent', password: 'Validation-seulement-2026' },
      '',
    )
    const cleaner = accept.headers.get('set-cookie')!.split(';')[0]!
    const { id: agent } = (await accept.json()) as { id: string }
    const admin = (e.sqlite.prepare("SELECT id FROM users WHERE role='admin'").get() as { id: string }).id
    const lots: string[] = []
    for (let i = 0; i < 5; i++) {
      const response = await e.request('/lots', 'POST', {
        building_id: 'test-building',
        number: String(i),
        floor: '',
        type: '',
      })
      assert.equal(response.status, 200, await response.clone().text())
      lots.push((e.sqlite.prepare('SELECT id FROM lots WHERE number=?').get(String(i)) as { id: string }).id)
    }
    const input = { agent_id: agent, day: '2026-10-12', template_id: 'none', note: '' }
    assert.equal(
      (await e.request('/cleaning/tasks', 'POST', { ...input, lot_ids: lots.slice(0, 2), priority: 'urgent' })).status,
      200,
    )
    for (const [index, priority] of ['high', 'normal', 'low'].entries()) {
      assert.equal(
        (
          await e.request('/cleaning/tasks', 'POST', {
            ...input,
            lot_ids: [lots[index + 2]],
            ...(priority === 'normal' ? {} : { priority }),
          })
        ).status,
        200,
      )
    }
    const url = '/cleaning/tasks?from=2026-10-12&to=2026-10-18'
    const tasks = (await (await e.request(url)).json()) as { id: string; priority: string }[]
    assert.deepEqual(
      tasks.map((row) => row.priority),
      ['urgent', 'urgent', 'high', 'normal', 'low'],
    )
    const task = tasks[0]!.id
    assert.equal(
      (
        await e.request(
          '/cleaning/tasks/' + task,
          'PATCH',
          { agent_id: agent, day: input.day, note: '', priority: 'low' },
          cleaner,
        )
      ).status,
      403,
    )
    assert.equal(
      (
        await e.request('/cleaning/tasks/' + task, 'PATCH', {
          agent_id: agent,
          day: input.day,
          note: '',
          priority: 'high',
        })
      ).status,
      200,
    )
    assert.equal(
      (await e.request('/cleaning/tasks/' + task, 'PATCH', { agent_id: agent, day: input.day, note: 'Consigne' }))
        .status,
      200,
    )
    assert.equal(
      (await e.request('/cleaning/tasks/reschedule', 'POST', { task_ids: [task], day: '2026-10-13' })).status,
      200,
    )
    const detail = (await (await e.request('/cleaning/tasks/' + task)).json()) as {
      task: { priority: string; day: string }
    }
    assert.equal(detail.task.priority, 'high')
    assert.equal(detail.task.day, '2026-10-13')
    const urgent = (await (await e.request(url + '&priority=urgent')).json()) as { id: string; priority: string }[]
    assert.equal(urgent.length, 1)
    assert.equal(
      (
        await e.request('/cleaning/tasks', 'POST', {
          ...input,
          lot_ids: [lots[0]],
          day: '2026-10-14',
          agent_id: admin,
          priority: 'urgent',
        })
      ).status,
      200,
    )
    const own = (await (
      await e.request(url + '&priority=urgent&agent=' + admin, 'GET', undefined, cleaner)
    ).json()) as { id: string }[]
    assert.deepEqual(
      own.map((row) => row.id),
      urgent.map((row) => row.id),
    )
    assert.equal(
      (await e.request('/cleaning/tasks/' + task + '/status', 'POST', { status: 'done', report: '' }, cleaner)).status,
      200,
    )
    assert.equal(
      (
        await e.request('/cleaning/tasks/' + task, 'PATCH', {
          agent_id: agent,
          day: '2026-10-13',
          note: '',
          priority: 'urgent',
        })
      ).status,
      409,
    )
    assert.throws(
      () => e.sqlite.prepare('UPDATE cleaning_tasks SET priority=? WHERE id=?').run('urgent', task),
      /cleaning_locked/,
    )
    assert.equal((await e.request(url + '&priority=impossible')).status, 400)
    assert.equal(
      (
        await e.request('/cleaning/tasks', 'POST', {
          ...input,
          day: '2026-10-15',
          lot_ids: [lots[0]],
          priority: 'impossible',
        })
      ).status,
      400,
    )
  } finally {
    await e.dispose()
  }
})
