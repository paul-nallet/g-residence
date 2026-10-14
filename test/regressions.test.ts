import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, today } from '../src/domain/rules.ts'
import { createApiHandler } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'

const environment = async () => {
  const { port, sqlite } = database(),
    web = createApiHandler(port)
  let cookie = ''
  const request = (path: string, method = 'GET', body?: unknown) =>
    web.handler(
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
  const setup = await request('/auth/setup', 'POST', {
    name: 'Gestionnaire',
    residenceName: 'Résidence test',
    email: 'admin@example.test',
    password: 'Validation-seulement-2026',
  })
  assert.equal(setup.status, 200)
  cookie = setup.headers.get('set-cookie')!.split(';')[0]!
  sqlite.prepare('INSERT INTO buildings(id,residence_id,name) SELECT ?,id,? FROM residences').run('b1', 'Bâtiment A')
  const json = async <A>(path: string, method = 'GET', body?: unknown) => {
    const response = await request(path, method, body)
    assert.equal(response.status, 200, `${method} ${path} : ${await response.clone().text()}`)
    return (await response.json()) as A
  }
  const status = async (path: string, method = 'GET', body?: unknown) => (await request(path, method, body)).status
  const lot = async (number: string) => {
    await json('/lots', 'POST', { number, floor: '', type: '', building_id: 'b1' })
    return (await json<{ items: { id: string }[] }>('/lots?q=' + number)).items[0]!.id
  }
  return {
    json,
    status,
    lot,
    sqlite,
    dispose: async () => {
      await web.dispose()
      sqlite.close()
    },
  }
}

test('lots : numéro en double et occupant dans la liste', async () => {
  const e = await environment()
  try {
    const id = await e.lot('101')
    assert.equal(await e.status('/lots', 'POST', { number: '101', floor: '', type: '', building_id: 'b1' }), 409)
    const start = addDays(today(), -10)
    await e.json('/lots/' + id + '/stays', 'POST', {
      first_name: 'Léa',
      last_name: 'Martin',
      planned_start: start,
      planned_end: null,
    })
    const page = await e.json<{ items: { resident: string; stay_start: string; notice: number }[] }>('/lots?q=martin')
    assert.deepEqual(
      page.items.map((item) => [item.resident, item.stay_start, item.notice]),
      [['Léa Martin', start, 0]],
    )
  } finally {
    await e.dispose()
  }
})

test('séjours : annulation sans perte des états des lieux réalisés et entrée après le départ prévu', async () => {
  const e = await environment()
  try {
    const id = await e.lot('102')
    const start = addDays(today(), -10)
    await e.json('/lots/' + id + '/stays', 'POST', {
      first_name: 'Hugo',
      last_name: 'Bernard',
      planned_start: start,
      planned_end: addDays(today(), -5),
    })
    const stay = e.sqlite.prepare('SELECT id FROM stays').get() as { id: string }
    assert.equal(await e.status('/stays/' + stay.id + '/actions', 'POST', { action: 'entry', date: today() }), 400)
    await e.json('/stays/' + stay.id + '/inspections', 'POST', {
      kind: 'entry',
      local_start: start + 'T10:00',
      duration: 30,
      status: 'done',
      completed_on: start,
      comment: '',
    })
    await e.json('/stays/' + stay.id + '/actions', 'POST', { action: 'cancel', date: today() })
    assert.deepEqual(
      { ...e.sqlite.prepare('SELECT status,completed_on FROM inspections').get() },
      {
        status: 'done',
        completed_on: start,
      },
    )
  } finally {
    await e.dispose()
  }
})

test('travaux : annulation des rendez-vous futurs et libération du signalement', async () => {
  const e = await environment()
  try {
    const id = await e.lot('103')
    await e.json('/technical/issues', 'POST', {
      title: 'Fuite',
      description: '',
      reported_on: today(),
      location: 'lot:' + id,
      status: 'open',
    })
    const issue = e.sqlite.prepare('SELECT id FROM issues').get() as { id: string }
    await e.json('/technical/works', 'POST', {
      title: 'Réparer la fuite',
      description: '',
      locations: ['lot:' + id],
      supplier_ids: [],
      planned_start: null,
      planned_end: null,
      issue_id: issue.id,
    })
    const work = e.sqlite.prepare('SELECT id FROM works').get() as { id: string }
    await e.json('/technical/works/' + work.id + '/interventions', 'POST', {
      local_start: addDays(today(), 5) + 'T09:00',
      duration: 60,
      supplier_id: '',
      status: 'planned',
      report: '',
    })
    await e.json('/technical/works/' + work.id + '/actions', 'POST', { action: 'cancel', date: null, comment: '' })
    assert.deepEqual({ ...e.sqlite.prepare('SELECT status FROM interventions').get() }, { status: 'cancelled' })
    assert.deepEqual({ ...e.sqlite.prepare('SELECT work_id FROM issues').get() }, { work_id: null })
    const intervention = e.sqlite.prepare('SELECT id FROM interventions').get() as { id: string }
    assert.equal(
      await e.status('/technical/interventions/' + intervention.id, 'PATCH', {
        local_start: addDays(today(), 6) + 'T09:00',
        duration: 60,
        supplier_id: '',
        status: 'planned',
        report: '',
      }),
      400,
    )
  } finally {
    await e.dispose()
  }
})

test('équipe : une nouvelle invitation révoque la précédente', async () => {
  const e = await environment()
  try {
    await e.json('/team/invitations', 'POST', { email: 'x@example.test', role: 'admin' })
    await e.json('/team/invitations', 'POST', { email: 'x@example.test', role: 'cleaner' })
    assert.deepEqual(
      e.sqlite
        .prepare('SELECT role FROM invitations WHERE used_at IS NULL')
        .all()
        .map((row) => ({ ...row })),
      [{ role: 'cleaner' }],
    )
  } finally {
    await e.dispose()
  }
})
