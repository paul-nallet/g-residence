import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, parisDate } from '../src/domain/rules.ts'
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
  const setup = await request('/auth/setup', 'POST', {
    name: 'Gestionnaire',
    residenceName: 'Résidence test',
    email: 'admin@example.test',
    password: 'Validation-seulement-2026',
  })
  assert.equal(setup.status, 200, await setup.clone().text())
  cookie = setup.headers.get('set-cookie')!.split(';')[0]!
  sqlite.prepare('INSERT INTO buildings(id,residence_id,name) SELECT ?,id,? FROM residences').run('b1', 'Bâtiment A')
  const json = async <A>(path: string, method = 'GET', body?: unknown, session = cookie) => {
    const response = await request(path, method, body, session)
    assert.equal(response.status, 200, `${method} ${path} : ${await response.clone().text()}`)
    return (await response.json()) as A
  }
  const status = async (path: string, method = 'GET', body?: unknown, session = cookie) =>
    (await request(path, method, body, session)).status
  const cleaner = async () => {
    const { token } = await json<{ token: string }>('/team/invitations', 'POST', {
      email: 'menage@example.test',
      role: 'cleaner',
    })
    const accept = await request(
      '/auth/invitations/' + token,
      'POST',
      { name: 'Agent', password: 'Validation-seulement-2026' },
      '',
    )
    assert.equal(accept.status, 200)
    return accept.headers.get('set-cookie')!.split(';')[0]!
  }
  return {
    request,
    json,
    status,
    cleaner,
    sqlite,
    dispose: async () => {
      await web.dispose()
      sqlite.close()
    },
  }
}

const supplierInput = {
  name: 'Plomberie Martin',
  trades: 'Plomberie',
  contact: 'M. Martin',
  phone: '0600000000',
  email: 'martin@example.test',
  notes: '',
  archived: false,
}

test('technique : lieux et fournisseurs uniques, archivage et recherche', async () => {
  const e = await environment()
  try {
    const hall = await e.json<{ id: string }>('/technical/places', 'POST', {
      name: 'Hall',
      building_id: 'b1',
      description: '',
      archived: false,
    })
    assert.equal(
      await e.status('/technical/places', 'POST', { name: 'HALL', building_id: '', description: '', archived: false }),
      409,
    )
    assert.equal(
      await e.status('/technical/places', 'POST', {
        name: 'Toiture',
        building_id: 'absent',
        description: '',
        archived: false,
      }),
      400,
    )
    assert.equal(
      await e.status('/technical/places', 'POST', { name: '  ', building_id: '', description: '', archived: false }),
      400,
    )
    await e.json('/technical/places/' + hall.id, 'PATCH', {
      name: 'Hall d’entrée',
      building_id: 'b1',
      description: 'Rez-de-chaussée',
      archived: true,
    })
    const places = await e.json<{ name: string; building_name: string; archived: boolean }[]>('/technical/places')
    assert.deepEqual(
      places.map((place) => [place.name, place.building_name, place.archived]),
      [['Hall d’entrée', 'Bâtiment A', true]],
    )
    assert.equal(
      await e.status('/technical/places/absent', 'PATCH', {
        name: 'X',
        building_id: '',
        description: '',
        archived: false,
      }),
      404,
    )

    const supplier = await e.json<{ id: string }>('/technical/suppliers', 'POST', supplierInput)
    assert.equal(await e.status('/technical/suppliers', 'POST', { ...supplierInput, name: 'plomberie martin' }), 409)
    assert.equal(await e.status('/technical/suppliers', 'POST', { ...supplierInput, name: 'B', email: 'faux' }), 400)
    await e.json('/technical/suppliers', 'POST', { ...supplierInput, name: 'Élec 100%', trades: 'Électricité' })
    type Page = { items: { name: string }[]; total: number }
    assert.equal((await e.json<Page>('/technical/suppliers')).total, 2)
    assert.deepEqual(
      (await e.json<Page>('/technical/suppliers?q=' + encodeURIComponent('100%'))).items.map((item) => item.name),
      ['Élec 100%'],
    )
    assert.equal((await e.json<Page>('/technical/suppliers?q=plomb')).total, 1)
    await e.json('/technical/suppliers/' + supplier.id, 'PATCH', { ...supplierInput, archived: true })
    assert.equal((await e.json<Page>('/technical/suppliers')).total, 1)
    assert.equal((await e.json<Page>('/technical/suppliers?archived=yes')).total, 1)
    assert.equal((await e.json<{ archived: boolean }>('/technical/suppliers/' + supplier.id)).archived, true)
    assert.equal(await e.status('/technical/suppliers?archived=peut-etre'), 400)
    const options = await e.json<{ locations: unknown[]; suppliers: { name: string }[] }>('/technical/options')
    assert.deepEqual(options.locations, [])
    assert.deepEqual(
      options.suppliers.map((item) => item.name),
      ['Élec 100%'],
    )
    assert.equal(
      (e.sqlite.prepare("SELECT COUNT(*) AS n FROM technical_changes WHERE entity='supplier'").get() as { n: number })
        .n,
      3,
    )
  } finally {
    await e.dispose()
  }
})

test('technique : signalement, travaux, journal, interventions, calendrier et isolation', async () => {
  const e = await environment()
  try {
    await e.json('/lots', 'POST', { building_id: 'b1', number: '101', floor: '1', type: 'Studio' })
    await e.json('/lots', 'POST', { building_id: 'b1', number: '102', floor: '1', type: 'Studio' })
    const lots = e.sqlite.prepare('SELECT id,number FROM lots ORDER BY number').all() as { id: string }[]
    const lot = 'lot:' + lots[0]!.id,
      otherLot = 'lot:' + lots[1]!.id
    const hall =
      'place:' +
      (
        await e.json<{ id: string }>('/technical/places', 'POST', {
          name: 'Hall',
          building_id: '',
          description: '',
          archived: false,
        })
      ).id
    const plumber = (await e.json<{ id: string }>('/technical/suppliers', 'POST', supplierInput)).id
    const painter = (
      await e.json<{ id: string }>('/technical/suppliers', 'POST', { ...supplierInput, name: 'Peintures' })
    ).id
    const today = parisDate(new Date()),
      tomorrow = addDays(today, 1)

    const issueInput = {
      title: 'Fuite sous évier',
      description: '',
      reported_on: '2026-03-02',
      location: lot,
      status: 'open',
    }
    assert.equal(await e.status('/technical/issues', 'POST', { ...issueInput, reported_on: tomorrow }), 400)
    assert.equal(await e.status('/technical/issues', 'POST', { ...issueInput, location: 'lot:absent' }), 400)
    assert.equal(await e.status('/technical/issues', 'POST', { ...issueInput, location: 'cave' }), 400)
    const issue = (await e.json<{ id: string }>('/technical/issues', 'POST', issueInput)).id
    await e.json('/technical/issues', 'POST', {
      ...issueInput,
      title: 'Trace au mur',
      location: '',
      status: 'dismissed',
    })
    type Issues = {
      items: { title: string; location: { label: string } | null; work_id: string | null }[]
      open: number
    }
    let issues = await e.json<Issues>('/technical/issues')
    assert.deepEqual(
      issues.items.map((item) => [item.title, item.location?.label ?? null]),
      [
        ['Fuite sous évier', 'Lot 101'],
        ['Trace au mur', null],
      ],
    )
    assert.equal(issues.open, 1)
    assert.equal((await e.json<Issues>('/technical/issues?status=dismissed')).items.length, 1)
    assert.equal((await e.json<Issues>('/technical/issues?q=lot%20101')).items.length, 1)

    const workInput = {
      title: 'Remplacer le siphon',
      description: '',
      locations: [lot, hall],
      supplier_ids: [plumber],
      planned_start: '2026-03-05',
      planned_end: '2026-03-06',
    }
    assert.equal(
      await e.status('/technical/works', 'POST', { ...workInput, planned_start: '2026-03-07', issue_id: issue }),
      400,
    )
    assert.equal(await e.status('/technical/works', 'POST', { ...workInput, locations: [] }), 400)
    assert.equal(await e.status('/technical/works', 'POST', { ...workInput, supplier_ids: ['absent'] }), 400)
    const work = (await e.json<{ id: string }>('/technical/works', 'POST', { ...workInput, issue_id: issue })).id
    assert.equal(await e.status('/technical/works', 'POST', { ...workInput, issue_id: issue }), 409)
    issues = await e.json<Issues>('/technical/issues?status=open')
    assert.equal(issues.items[0]!.work_id, work)
    const unplanned = (
      await e.json<{ id: string }>('/technical/works', 'POST', {
        ...workInput,
        title: 'Repeindre la cage',
        locations: [hall],
        supplier_ids: [],
        planned_start: null,
        planned_end: null,
      })
    ).id

    type Works = { items: { id: string; status: string; locations: string[]; suppliers: string[] }[]; active: number }
    let works = await e.json<Works>('/technical/works')
    assert.deepEqual(
      works.items.map((item) => [item.status, item.locations, item.suppliers]),
      [
        ['planned', ['Lot 101', 'Hall'], ['Plomberie Martin']],
        ['to_plan', ['Hall'], []],
      ],
    )
    assert.equal(works.active, 2)
    assert.equal((await e.json<Works>('/technical/works?status=to_plan')).items[0]!.id, unplanned)
    assert.equal((await e.json<Works>('/technical/works?location=' + encodeURIComponent(lot))).items.length, 1)
    assert.equal((await e.json<Works>('/technical/works?supplier=' + plumber)).items.length, 1)
    assert.equal((await e.json<Works>('/technical/works?q=martin')).items.length, 1)
    assert.equal(await e.status('/technical/works?status=autre'), 400)

    const intervention = {
      local_start: '2026-03-10T09:30',
      duration: 60,
      supplier_id: painter,
      status: 'planned',
      report: '',
    }
    assert.equal(await e.status('/technical/works/' + work + '/interventions', 'POST', intervention), 400)
    assert.equal(
      await e.status('/technical/works/' + work + '/interventions', 'POST', {
        ...intervention,
        local_start: '2026-03-29T02:30',
        supplier_id: '',
      }),
      400,
    )
    assert.equal(
      await e.status('/technical/works/' + work + '/interventions', 'POST', {
        ...intervention,
        local_start: tomorrow + 'T10:00',
        supplier_id: plumber,
        status: 'done',
      }),
      400,
    )
    await e.json('/technical/works/' + work + '/interventions', 'POST', { ...intervention, supplier_id: plumber })
    await e.json('/technical/works/' + work + '/interventions', 'POST', {
      ...intervention,
      local_start: tomorrow + 'T14:00',
      supplier_id: '',
    })
    type Event = {
      id: string
      kind: string
      time: string
      title?: string
      place?: string
      resident: string
      workId?: string
    }
    const events = await e.json<Event[]>('/calendar?from=2026-03-09&to=2026-03-15')
    assert.deepEqual(events, [
      {
        id: events[0]!.id,
        lotId: '',
        lotNumber: '',
        kind: 'intervention',
        date: '2026-03-10',
        time: '09:30',
        duration: 60,
        status: 'planned',
        resident: 'Plomberie Martin',
        comment: '',
        workId: work,
        title: 'Remplacer le siphon',
        place: 'Lot 101, Hall',
      },
    ])
    const lotEvents = (await e.json<{ events: Event[] }>('/lots/' + lots[0]!.id)).events
    assert.deepEqual(
      lotEvents.map((event) => [event.kind, event.time, event.workId]),
      [['intervention', '14:00', work]],
    )
    assert.deepEqual((await e.json<{ events: Event[] }>('/lots/' + lots[1]!.id)).events, [])

    const cleaner = await e.cleaner()
    assert.deepEqual(await e.json<Event[]>('/calendar?from=2026-03-09&to=2026-03-15', 'GET', undefined, cleaner), [])
    assert.deepEqual((await e.json<{ events: Event[] }>('/lots/' + lots[0]!.id, 'GET', undefined, cleaner)).events, [])
    for (const path of ['/technical/options', '/technical/works', '/technical/issues', '/technical/places'])
      assert.equal(await e.status(path, 'GET', undefined, cleaner), 403)
    assert.equal(
      await e.status('/technical/works/' + work + '/notes', 'POST', { kind: 'note', body: 'x' }, cleaner),
      403,
    )

    assert.equal(
      await e.status('/technical/works/' + work + '/actions', 'POST', { action: 'start', date: tomorrow, comment: '' }),
      400,
    )
    assert.equal(
      await e.status('/technical/works/' + work + '/actions', 'POST', { action: 'start', date: null, comment: '' }),
      400,
    )
    await e.json('/technical/works/' + work + '/actions', 'POST', { action: 'start', date: '2026-03-10', comment: '' })
    assert.equal(
      await e.status('/technical/works/' + work + '/actions', 'POST', {
        action: 'finish',
        date: '2026-03-09',
        comment: '',
      }),
      400,
    )
    await e.json('/technical/works/' + work + '/notes', 'POST', { kind: 'problem', body: 'Pièce à commander' })
    assert.equal(await e.status('/technical/works/' + work + '/notes', 'POST', { kind: 'status', body: 'x' }), 400)
    type Detail = {
      status: string
      actual_start: string | null
      actual_end: string | null
      notes: { kind: string; body: string; actor: string }[]
      interventions: { id: string; status: string; supplier: string | null }[]
      issues: { status: string }[]
      locations: { label: string; archived: boolean }[]
    }
    let detail = await e.json<Detail>('/technical/works/' + work)
    const past = detail.interventions.find((item) => item.supplier === 'Plomberie Martin')!
    await e.json('/technical/interventions/' + past.id, 'PATCH', {
      ...intervention,
      supplier_id: plumber,
      status: 'done',
      report: 'Siphon remplacé',
    })
    assert.equal(
      await e.status('/technical/interventions/absent', 'PATCH', { ...intervention, supplier_id: plumber }),
      404,
    )
    await e.json('/technical/works/' + work + '/actions', 'POST', {
      action: 'finish',
      date: '2026-03-11',
      comment: 'RAS',
    })
    detail = await e.json<Detail>('/technical/works/' + work)
    assert.equal(detail.status, 'done')
    assert.deepEqual([detail.actual_start, detail.actual_end], ['2026-03-10', '2026-03-11'])
    assert.deepEqual(
      detail.issues.map((item) => item.status),
      ['resolved'],
    )
    assert.deepEqual(
      detail.notes.map((note) => [note.kind, note.body]),
      [
        ['status', 'Chantier terminé — RAS'],
        ['status', 'Intervention du 10/03/2026 09:30 réalisée — Siphon remplacé'],
        ['problem', 'Pièce à commander'],
        ['status', 'Chantier démarré'],
        ['status', 'Chantier créé depuis le signalement « Fuite sous évier »'],
      ],
    )
    assert.equal(
      await e.status('/technical/works/' + work + '/interventions', 'POST', {
        ...intervention,
        local_start: tomorrow + 'T09:00',
        supplier_id: '',
      }),
      400,
    )
    assert.equal(
      await e.status('/technical/works/' + work + '/actions', 'POST', { action: 'cancel', date: null, comment: '' }),
      400,
    )
    await e.json('/technical/works/' + work + '/actions', 'POST', { action: 'reopen', date: null, comment: '' })
    assert.equal((await e.json<Detail>('/technical/works/' + work)).status, 'in_progress')

    e.sqlite.prepare('UPDATE lots SET archived=1 WHERE id=?').run(lots[0]!.id)
    await e.json('/technical/works/' + work, 'PATCH', { ...workInput, title: 'Siphon et joints' })
    assert.equal(
      await e.status('/technical/works/' + unplanned, 'PATCH', { ...workInput, locations: [lot], supplier_ids: [] }),
      400,
    )
    await e.json('/technical/suppliers/' + plumber, 'PATCH', { ...supplierInput, archived: true })
    assert.equal(await e.status('/technical/works/' + unplanned, 'PATCH', { ...workInput, locations: [otherLot] }), 400)
    detail = await e.json<Detail>('/technical/works/' + work)
    assert.deepEqual(
      detail.locations.map((item) => [item.label, item.archived]),
      [
        ['Lot 101', true],
        ['Hall', false],
      ],
    )
    works = await e.json<Works>('/technical/works?status=all')
    assert.deepEqual(
      works.items.map((item) => item.status),
      ['in_progress', 'to_plan'],
    )

    const residence = (e.sqlite.prepare('SELECT id FROM residences').get() as { id: string }).id
    e.sqlite.exec('PRAGMA foreign_keys=OFF')
    e.sqlite
      .prepare(
        "INSERT INTO works(id,residence_id,title,created_by,created_at) VALUES('foreign-work','other','Autre','x','2026-01-01')",
      )
      .run()
    e.sqlite.prepare("INSERT INTO places(id,residence_id,name) VALUES('foreign-place','other','Cave')").run()
    e.sqlite.exec('PRAGMA foreign_keys=ON')
    assert.notEqual(residence, 'other')
    assert.equal(await e.status('/technical/works/foreign-work'), 404)
    assert.equal(await e.status('/technical/works/foreign-work/notes', 'POST', { kind: 'note', body: 'x' }), 404)
    assert.equal(
      await e.status('/technical/works', 'POST', {
        ...workInput,
        locations: ['place:foreign-place'],
        supplier_ids: [],
      }),
      400,
    )
    assert.equal((await e.json<Works>('/technical/works?status=all')).items.length, 2)
  } finally {
    await e.dispose()
  }
})
