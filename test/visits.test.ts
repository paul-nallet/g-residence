import assert from 'node:assert/strict'
import test from 'node:test'
import { nextVisitDate, type VisitDetail, type VisitTemplate } from '../src/domain/visits.ts'
import { parisDate, addDays } from '../src/domain/rules.ts'
import { createApiHandler } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'

const environment = async () => {
  const { port, sqlite } = database(),
    web = createApiHandler(port)
  let cookie = ''
  const request = (path: string, method = 'GET', body?: unknown, session = cookie) =>
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
  const response = await request('/auth/setup', 'POST', {
    name: 'Gestionnaire',
    residenceName: 'Résidence test',
    email: 'admin@example.test',
    password: 'Validation-seulement-2026',
  })
  assert.equal(response.status, 200)
  cookie = response.headers.get('set-cookie')!.split(';')[0]!
  sqlite.prepare('INSERT INTO buildings(id,residence_id,name) SELECT ?,id,? FROM residences').run('b1', 'Bâtiment A')
  const json = async <A>(path: string, method = 'GET', body?: unknown, session = cookie) => {
    const result = await request(path, method, body, session)
    assert.equal(result.status, 200, `${method} ${path} : ${await result.clone().text()}`)
    return (await result.json()) as A
  }
  const status = async (path: string, method = 'GET', body?: unknown, session = cookie) =>
    (await request(path, method, body, session)).status
  return {
    json,
    status,
    sqlite,
    dispose: async () => {
      await web.dispose()
      sqlite.close()
    },
    cleaner: async () => {
      const { token } = await json<{ token: string }>('/team/invitations', 'POST', {
        email: 'menage@example.test',
        role: 'cleaner',
      })
      const accepted = await request(
        '/auth/invitations/' + token,
        'POST',
        { name: 'Agent', password: 'Validation-seulement-2026' },
        '',
      )
      return accepted.headers.get('set-cookie')!.split(';')[0]!
    },
  }
}
const model = {
  name: 'Visite mensuelle',
  building_id: 'b1',
  frequency: 'monthly',
  first_due: '2026-01-31',
  archived: false,
  points: [
    { zone: 'Hall', label: 'Éclairage', location: null },
    { zone: 'Couloirs', label: 'Murs', location: null },
  ],
}

test('visites : échéances civiles avec fin de mois, trimestre et changement d’année', () => {
  assert.equal(nextVisitDate('2026-01-31', 'monthly'), '2026-02-28')
  assert.equal(nextVisitDate('2028-01-31', 'monthly'), '2028-02-29')
  assert.equal(nextVisitDate('2026-11-30', 'quarterly'), '2027-02-28')
  assert.equal(nextVisitDate('2026-12-28', 'weekly'), '2027-01-04')
  assert.equal(nextVisitDate('2026-12-28', 'once'), null)
})

test('visites : snapshots, constats, clôture, signalement idempotent, calendrier et bilan', async () => {
  const e = await environment()
  try {
    const template = (await e.json<{ id: string }>('/technical/visit-templates', 'POST', model)).id
    assert.equal(await e.status('/technical/visit-templates', 'POST', { ...model, name: 'VISITE MENSUELLE' }), 409)
    assert.equal(
      await e.status('/technical/visit-templates', 'POST', { ...model, name: 'Autre', first_due: null }),
      400,
    )
    assert.equal(await e.status('/technical/visit-templates', 'POST', { ...model, points: [] }), 400)
    assert.equal(
      await e.status('/technical/visit-templates', 'POST', {
        ...model,
        points: [{ zone: 'Hall', label: 'X', location: 'place:absent' }],
      }),
      400,
    )
    const visit = (
      await e.json<{ id: string }>('/technical/visits', 'POST', { template_id: template, scheduled_on: '2026-03-10' })
    ).id
    assert.equal(
      await e.status('/technical/visits', 'POST', { template_id: template, scheduled_on: '2026-03-11' }),
      409,
    )
    await e.json('/technical/visit-templates/' + template, 'PUT', {
      ...model,
      name: 'Nouvelle liste',
      points: [{ zone: 'Hall', label: 'Porte', location: null }],
    })
    let detail = await e.json<VisitDetail>('/technical/visits/' + visit)
    assert.equal(detail.name, model.name)
    assert.equal(detail.points.length, 2)
    const finish = { action: 'finish', completed_on: '2026-03-10', report: 'Tournée complète' }
    assert.equal(await e.status('/technical/visits/' + visit + '/actions', 'POST', finish), 400)
    assert.equal(
      await e.status('/technical/visits/' + visit + '/points/' + detail.points[0]!.id, 'PATCH', {
        state: 'issue',
        note: '',
      }),
      400,
    )
    await e.json('/technical/visits/' + visit + '/points/' + detail.points[0]!.id, 'PATCH', {
      state: 'issue',
      note: 'Ampoule cassée',
    })
    await e.json('/technical/visits/' + visit + '/points/' + detail.points[1]!.id, 'PATCH', {
      state: 'not_verified',
      note: 'Couloir inaccessible',
    })
    const issuePath = '/technical/visits/' + visit + '/points/' + detail.points[0]!.id + '/issue'
    assert.equal(await e.status(issuePath, 'POST'), 400)
    const future = addDays(parisDate(new Date()), 1)
    assert.equal(
      await e.status('/technical/visits/' + visit + '/actions', 'POST', { ...finish, completed_on: future }),
      400,
    )
    await e.json('/technical/visits/' + visit + '/actions', 'POST', finish)
    detail = await e.json<VisitDetail>('/technical/visits/' + visit)
    assert.equal(detail.status, 'done')
    assert.equal(detail.handled, 2)
    assert.equal(detail.anomalies, 1)
    assert.equal(await e.status('/technical/visits/' + visit, 'PATCH', { scheduled_on: '2026-03-12' }), 409)
    assert.equal(
      await e.status('/technical/visits/' + visit + '/points/' + detail.points[0]!.id, 'PATCH', {
        state: 'ok',
        note: '',
      }),
      409,
    )
    const issue = await e.json<{ id: string }>(issuePath, 'POST')
    assert.deepEqual(await e.json(issuePath, 'POST'), issue)
    const issues = await e.json<{ total: number; items: { description: string; reported_on: string }[] }>(
      '/technical/issues',
    )
    assert.equal(issues.total, 1)
    assert.match(issues.items[0]!.description, /Ampoule cassée/)
    assert.equal(issues.items[0]!.reported_on, '2026-03-10')
    const next = await e.json<VisitTemplate>('/technical/visit-templates/' + template)
    assert.equal(next.last_completed, '2026-03-10')
    assert.equal(next.next_due, '2026-04-10')
    const calendar = await e.json<{ kind: string; visitId?: string }[]>('/calendar?from=2026-03-09&to=2026-03-15')
    assert.deepEqual(
      calendar.map((v) => [v.kind, v.visitId]),
      [['technical_visit', visit]],
    )
    const report = await e.json<{ rows: { kind: string; comment: string }[] }>('/reports/weekly?date=2026-03-10')
    assert.equal(report.rows.filter((r) => r.kind === 'Visite technique réalisée').length, 1)
    assert.match(report.rows.find((r) => r.kind === 'Visite technique réalisée')!.comment, /Couloir inaccessible/)
    assert.equal((e.sqlite.prepare('SELECT COUNT(*) AS n FROM visit_changes').get() as { n: number }).n, 7)
  } finally {
    await e.dispose()
  }
})

test('visites : annulation, archivage, filtre, pagination et permissions de résidence', async () => {
  const e = await environment()
  try {
    const template = (await e.json<{ id: string }>('/technical/visit-templates', 'POST', model)).id
    const create = () =>
      e.json<{ id: string }>('/technical/visits', 'POST', { template_id: template, scheduled_on: '2026-03-10' })
    const first = (await create()).id
    await e.json('/technical/visits/' + first, 'PATCH', { scheduled_on: '2026-03-11' })
    await e.json('/technical/visits/' + first + '/actions', 'POST', {
      action: 'cancel',
      completed_on: null,
      report: 'Indisponible',
    })
    assert.equal((await e.json<VisitTemplate>('/technical/visit-templates/' + template)).next_due, model.first_due)
    assert.equal(
      (await e.json<{ rows: { kind: string }[] }>('/reports/weekly?date=2026-03-10')).rows.some(
        (r) => r.kind === 'Visite technique réalisée',
      ),
      false,
    )
    for (let i = 0; i < 20; i++) {
      const visit = (await create()).id
      await e.json('/technical/visits/' + visit + '/actions', 'POST', {
        action: 'cancel',
        completed_on: null,
        report: '',
      })
    }
    assert.equal((await e.json<{ items: unknown[] }>('/technical/visits?page=1')).items.length, 20)
    assert.equal((await e.json<{ items: unknown[] }>('/technical/visits?page=2')).items.length, 1)
    assert.equal((await e.json<{ total: number }>('/technical/visits?status=planned')).total, 0)
    assert.equal((await e.json<{ total: number }>('/technical/visits?building=other')).total, 0)
    assert.equal((await e.json<{ total: number }>('/technical/visits?q=introuvable')).total, 0)
    await e.json('/technical/visit-templates/' + template, 'PUT', { ...model, archived: true })
    assert.equal((await e.json<VisitTemplate>('/technical/visit-templates/' + template)).next_due, null)
    assert.equal(
      await e.status('/technical/visits', 'POST', { template_id: template, scheduled_on: '2026-03-12' }),
      400,
    )
    const cleaner = await e.cleaner()
    for (const path of [
      '/technical/visits',
      '/technical/visits/' + first,
      '/technical/visit-templates',
      '/technical/visit-templates/' + template,
    ])
      assert.equal(await e.status(path, 'GET', undefined, cleaner), 403)
    assert.equal(await e.status('/technical/visit-templates', 'POST', model, cleaner), 403)
    assert.equal(await e.status('/technical/visits', 'GET', undefined, ''), 401)
    e.sqlite.exec('PRAGMA foreign_keys=OFF')
    e.sqlite.prepare("INSERT INTO buildings(id,residence_id,name) VALUES('foreign-building','other','Autre')").run()
    e.sqlite.exec('PRAGMA foreign_keys=ON')
    assert.equal(
      await e.status('/technical/visit-templates', 'POST', { ...model, building_id: 'foreign-building' }),
      400,
    )
    assert.equal(await e.status('/technical/visits/foreign'), 404)
    assert.equal(await e.status('/technical/visit-templates/foreign'), 404)
    assert.equal(
      await e.status('/technical/visits', 'POST', { template_id: 'foreign', scheduled_on: '2026-03-10' }),
      404,
    )
    assert.equal(
      (await e.json<unknown[]>('/calendar?from=2026-03-09&to=2026-03-15', 'GET', undefined, cleaner)).length,
      0,
    )
  } finally {
    await e.dispose()
  }
})

test('visites : planification directe atomique sans création préalable de modèle', async () => {
  const e = await environment()
  try {
    const { first_due, archived, ...direct } = model
    const payload = { ...direct, scheduled_on: '2026-03-10' }
    const visit = await e.json<{ id: string }>('/technical/visits/new', 'POST', payload)
    const detail = await e.json<VisitDetail>('/technical/visits/' + visit.id)
    assert.equal(detail.name, model.name)
    assert.equal(detail.points.length, 2)
    assert.equal(detail.status, 'planned')
    assert.equal(
      (await e.json<VisitTemplate>('/technical/visit-templates/' + detail.template_id)).next_due,
      payload.scheduled_on,
    )
    assert.equal(await e.status('/technical/visits/new', 'POST', { ...payload, building_id: 'foreign' }), 400)
    assert.equal(
      await e.status('/technical/visits/new', 'POST', {
        ...payload,
        name: 'Autre',
        points: [{ zone: 'Hall', label: 'X', location: 'place:absent' }],
      }),
      400,
    )
    assert.equal((e.sqlite.prepare('SELECT COUNT(*) AS n FROM technical_visits').get() as { n: number }).n, 1)
    assert.equal((e.sqlite.prepare('SELECT COUNT(*) AS n FROM visit_templates').get() as { n: number }).n, 1)
    assert.equal(await e.status('/technical/visits/new', 'POST', payload, await e.cleaner()), 403)
    assert.ok(first_due)
    assert.equal(archived, false)
    assert.equal(await e.status('/technical/visits/new', 'POST', { ...payload, frequency: 'weekly' }), 409)
    assert.equal((await e.json<VisitTemplate>('/technical/visit-templates/' + detail.template_id)).frequency, 'monthly')
    await e.json('/technical/visits/' + visit.id + '/actions', 'POST', {
      action: 'cancel',
      completed_on: null,
      report: '',
    })
    assert.equal(
      await e.status('/technical/visits/new', 'POST', {
        ...payload,
        name: model.name.toUpperCase(),
        frequency: 'weekly',
        points: [{ zone: 'Hall', label: 'Porte', location: null }],
      }),
      409,
    )
    const template = await e.json<VisitTemplate>('/technical/visit-templates/' + detail.template_id)
    assert.deepEqual([template.frequency, template.points.length], ['monthly', 2])
    const other = await e.json<{ id: string }>('/technical/visits/new', 'POST', { ...payload, name: 'Visite du hall' })
    assert.notEqual((await e.json<VisitDetail>('/technical/visits/' + other.id)).template_id, detail.template_id)
    assert.equal((e.sqlite.prepare('SELECT COUNT(*) AS n FROM visit_templates').get() as { n: number }).n, 2)
  } finally {
    await e.dispose()
  }
})
