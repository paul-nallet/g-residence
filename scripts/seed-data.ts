import { addDays, appointmentInstant, shiftMonth } from '../src/domain/rules.ts'

export const SEED_PASSWORD = 'Demo-GResidence-2026'
export const SEED_ACCOUNTS = [
  { id: 'seed-user-admin', email: 'admin@gresidence.test', name: 'Camille Martin', role: 'admin' },
  { id: 'seed-user-manager', email: 'gestion@gresidence.test', name: 'Julien Morel', role: 'manager' },
  { id: 'seed-user-cleaner-1', email: 'menage1@gresidence.test', name: 'Fatou Diallo', role: 'cleaner' },
  { id: 'seed-user-cleaner-2', email: 'menage2@gresidence.test', name: 'Marc Lefèvre', role: 'cleaner' },
] as const

type Value = string | number | null

const encoder = new TextEncoder()
const passwordHash = async (password: string, salt: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const R = 'seed-residence'
const ADMIN = 'seed-user-admin'
const MANAGER = 'seed-user-manager'
const CLEANERS = ['seed-user-cleaner-1', 'seed-user-cleaner-2'] as const

const literal = (value: Value) =>
  value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`

const insert = (table: string, row: Record<string, Value>) =>
  `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`

const at = (day: string, time = '09:00') => appointmentInstant(`${day}T${time}`) ?? `${day}T08:00:00.000Z`

const FIRST_NAMES = [
  'Léa',
  'Hugo',
  'Chloé',
  'Lucas',
  'Manon',
  'Nathan',
  'Inès',
  'Théo',
  'Sarah',
  'Yanis',
  'Camille',
  'Louis',
  'Jade',
  'Adam',
  'Zoé',
  'Noah',
  'Lina',
  'Enzo',
  'Emma',
  'Rayan',
  'Alice',
  'Tom',
  'Anaïs',
  'Sacha',
  'Clara',
  'Mehdi',
]
const LAST_NAMES = [
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Richard',
  'Petit',
  'Durand',
  'Leroy',
  'Moreau',
  'Simon',
  'Laurent',
  'Lefebvre',
  'Michel',
  'Garcia',
  'David',
  'Bertrand',
  'Roux',
  'Vincent',
  'Fournier',
  'Morel',
  'Girard',
  'Andre',
  'Mercier',
  'Dupont',
  'Lambert',
  'Bonnet',
]

const person = (index: number) => ({
  first_name: FIRST_NAMES[index % FIRST_NAMES.length]!,
  last_name: LAST_NAMES[(index * 7) % LAST_NAMES.length]!,
})

export const seedSql = async (today: string) => {
  const out: string[] = []
  const add = (table: string, row: Record<string, Value>) => out.push(insert(table, row))
  const created = at(addDays(today, -400), '10:00')
  let counter = 0
  const id = (prefix: string) => `seed-${prefix}-${String(++counter).padStart(4, '0')}`
  const history = (lotId: string | null, actor: string, action: string, after: unknown, day: string) =>
    add('history', {
      id: id('history'),
      residence_id: R,
      lot_id: lotId,
      actor_id: actor,
      action,
      before_json: null,
      after_json: JSON.stringify(after),
      created_at: at(day, '10:00'),
    })

  add('residences', { id: R, name: 'Résidence Les Tilleuls' })
  for (const account of SEED_ACCOUNTS) {
    const salt = `${account.id}-salt`
    add('users', {
      id: account.id,
      residence_id: R,
      email: account.email,
      name: account.name,
      role: account.role,
      password_hash: await passwordHash(SEED_PASSWORD, salt),
      salt,
      created_at: created,
    })
  }

  const buildings = [
    { id: 'seed-building-a', name: 'Bâtiment A' },
    { id: 'seed-building-b', name: 'Bâtiment B' },
  ]
  for (const building of buildings) add('buildings', { ...building, residence_id: R })

  const types = ['Studio', 'Studio', 'T1', 'T1 bis', 'Studio', 'T2', 'Studio', 'T1']
  const lots = [
    ...[1, 2, 3].flatMap((floor) =>
      Array.from({ length: 8 }, (_, index) => ({
        number: `A${floor}0${index + 1}`,
        floor: String(floor),
        type: types[index]!,
        building: 'seed-building-a',
      })),
    ),
    ...Array.from({ length: 6 }, (_, index) => ({
      number: `B0${index + 1}`,
      floor: 'RDC',
      type: index % 3 === 2 ? 'T2' : 'Studio',
      building: 'seed-building-b',
    })),
  ].map((lot) => ({ ...lot, id: `seed-lot-${lot.number.toLowerCase()}` }))
  for (const lot of lots) {
    add('lots', {
      id: lot.id,
      residence_id: R,
      number: lot.number,
      floor: lot.floor,
      type: lot.type,
      building_id: lot.building,
    })
    history(lot.id, ADMIN, 'Lot créé', { number: lot.number, floor: lot.floor, type: lot.type }, addDays(today, -400))
  }
  add('lots', {
    id: 'seed-lot-b07',
    residence_id: R,
    number: 'B07',
    floor: 'RDC',
    type: 'Local',
    building_id: 'seed-building-b',
  })
  out.push(`UPDATE lots SET archived=1 WHERE id='seed-lot-b07';`)

  type Stay = { id: string; lot: string; start: string; end: string | null; started: boolean; ended: boolean }
  const stays: Stay[] = []
  const addStay = (lot: string, index: number, start: string, end: string | null, started: boolean, ended: boolean) => {
    const stay = { id: id('stay'), lot, start, end, started, ended }
    stays.push(stay)
    add('stays', {
      id: stay.id,
      residence_id: R,
      lot_id: lot,
      ...person(index),
      planned_start: start,
      planned_end: end,
      actual_start: started ? start : null,
      actual_end: ended ? end : null,
    })
    history(
      lot,
      MANAGER,
      'Séjour créé',
      { ...person(index), planned_start: start, planned_end: end },
      addDays(start, -30),
    )
    return stay
  }
  const inspection = (stay: Stay, kind: 'entry' | 'exit', day: string, status: 'planned' | 'done', time = '10:00') =>
    add('inspections', {
      id: id('inspection'),
      residence_id: R,
      stay_id: stay.id,
      kind,
      starts_at: at(day, time),
      duration: 45,
      status,
      completed_on: status === 'done' ? day : null,
      comment: status === 'done' && kind === 'exit' ? 'Logement rendu propre, RAS.' : '',
    })

  const vacant = new Set(['seed-lot-a107', 'seed-lot-a305', 'seed-lot-b05'])
  const arriving = new Set(['seed-lot-a204', 'seed-lot-b06'])
  const withNotice = new Set(['seed-lot-a102', 'seed-lot-a206', 'seed-lot-a301', 'seed-lot-b02'])
  const withPast = new Set(['seed-lot-a101', 'seed-lot-a203', 'seed-lot-a302', 'seed-lot-b01', 'seed-lot-a204'])
  lots.forEach((lot, index) => {
    const yearStart = addDays(today, -60 - (index % 5) * 20)
    if (withPast.has(lot.id)) {
      const past = addStay(lot.id, index + 40, addDays(yearStart, -320), addDays(yearStart, -5), true, true)
      inspection(past, 'entry', past.start, 'done')
      inspection(past, 'exit', past.end!, 'done', '15:00')
    }
    if (vacant.has(lot.id)) return
    if (arriving.has(lot.id)) {
      const next = addStay(lot.id, index, addDays(today, 3 + (index % 4)), addDays(today, 300), false, false)
      inspection(next, 'entry', next.start, 'planned', '14:00')
      return
    }
    const stay = addStay(lot.id, index, yearStart, addDays(yearStart, 320), true, false)
    inspection(stay, 'entry', stay.start, 'done')
    if (withNotice.has(lot.id)) {
      const departure = addDays(today, 6 + (index % 4) * 5)
      const received = addDays(today, -20 + (index % 3) * 6)
      add('notices', {
        id: id('notice'),
        residence_id: R,
        stay_id: stay.id,
        received_on: received,
        departure_on: departure,
        previous_end: stay.end,
        comment: index % 2 ? 'Fin de stage' : 'Départ pour un autre logement',
      })
      out.push(`UPDATE stays SET planned_end='${departure}' WHERE id='${stay.id}';`)
      history(lot.id, MANAGER, 'Préavis reçu', { received_on: received, departure_on: departure }, received)
      inspection(stay, 'exit', departure, 'planned', '11:00')
    }
  })
  const cancelled = id('stay')
  add('stays', {
    id: cancelled,
    residence_id: R,
    lot_id: 'seed-lot-a107',
    first_name: 'Paul',
    last_name: 'Annulé',
    planned_start: addDays(today, 20),
    planned_end: addDays(today, 200),
    cancelled: 1,
  })

  const meters = [
    {
      id: 'seed-meter-water',
      name: 'Eau générale',
      location: 'Local technique A',
      reference: 'EAU-74521',
      kind: 'water',
      unit: 'm3',
      base: 1840,
      step: 95,
    },
    {
      id: 'seed-meter-power',
      name: 'Électricité communs',
      location: 'Tableau général A',
      reference: 'PDL 09875432112',
      kind: 'electricity',
      unit: 'kWh',
      base: 52310,
      step: 1450,
    },
    {
      id: 'seed-meter-gas',
      name: 'Gaz chaufferie',
      location: 'Chaufferie',
      reference: 'GRDF-332190',
      kind: 'gas',
      unit: 'kWh',
      base: 210400,
      step: 8200,
    },
  ]
  for (const meter of meters) {
    const { base, step, ...row } = meter
    add('meters', { ...row, residence_id: R })
    let value = base
    for (let month = 12; month >= 0; month--) {
      const day = shiftMonth(today.slice(0, 8) + '01', -month)
      if (day > today) continue
      value += Math.round(step * (0.75 + ((month * 37) % 50) / 100))
      add('meter_readings', {
        id: id('reading'),
        residence_id: R,
        meter_id: meter.id,
        observed_on: day,
        value,
        actor_id: MANAGER,
      })
    }
  }

  const categories = ['Entretien', 'Linge', 'Consommables', 'Technique'].map((name) => ({
    id: `seed-category-${name.toLowerCase()}`,
    name,
  }))
  for (const category of categories) add('stock_categories', { ...category, residence_id: R })
  const items = [
    { name: 'Produit multi-surfaces', category: 0, unit: 'flacon', threshold: 10, received: 40, used: 26 },
    { name: 'Désinfectant sanitaires', category: 0, unit: 'flacon', threshold: 8, received: 24, used: 19 },
    { name: 'Sacs poubelle 50 L', category: 0, unit: 'rouleau', threshold: 15, received: 60, used: 22 },
    { name: 'Microfibres', category: 0, unit: 'pièce', threshold: 20, received: 50, used: 12 },
    { name: 'Draps 1 personne', category: 1, unit: 'jeu', threshold: 12, received: 40, used: 8 },
    { name: 'Serviettes de bain', category: 1, unit: 'pièce', threshold: 20, received: 60, used: 45 },
    { name: 'Papier toilette', category: 2, unit: 'paquet', threshold: 10, received: 30, used: 24 },
    { name: 'Savon mains', category: 2, unit: 'recharge', threshold: 6, received: 18, used: 7 },
    { name: 'Ampoules LED E27', category: 3, unit: 'pièce', threshold: 10, received: 25, used: 18 },
    { name: 'Piles AA', category: 3, unit: 'paquet', threshold: 4, received: 10, used: 3 },
    { name: 'Joints silicone', category: 3, unit: 'cartouche', threshold: 3, received: 6, used: 4 },
  ]
  for (const item of items) {
    const itemId = id('stock')
    const quantity = item.received - item.used
    add('stock_items', {
      id: itemId,
      residence_id: R,
      name: item.name,
      unit: item.unit,
      threshold: item.threshold,
      quantity,
    })
    add('stock_item_categories', { residence_id: R, item_id: itemId, category_id: categories[item.category]!.id })
    const movement = (kind: string, delta: number, after: number, day: string, comment: string, actor: string) =>
      add('stock_movements', {
        id: id('movement'),
        residence_id: R,
        item_id: itemId,
        kind,
        delta,
        quantity_after: after,
        occurred_on: day,
        comment,
        actor_id: actor,
        created_at: at(day, '11:00'),
      })
    movement('in', item.received, item.received, addDays(today, -45), 'Livraison fournisseur', MANAGER)
    const first = Math.ceil(item.used / 2)
    movement('out', -first, item.received - first, addDays(today, -20), 'Ménage', CLEANERS[0])
    movement('out', first - item.used, quantity, addDays(today, -4), 'Ménage', CLEANERS[1])
  }
  add('stock_views', { id: 'seed-view-menage', residence_id: R, name: 'Chariot ménage' })
  for (const category of [0, 1, 2])
    add('stock_view_categories', {
      residence_id: R,
      view_id: 'seed-view-menage',
      category_id: categories[category]!.id,
    })

  const templates = [
    {
      id: 'seed-template-standard',
      name: 'Ménage standard',
      is_default: 1,
      items: [
        ['task', 'Aspirer et laver les sols'],
        ['task', 'Nettoyer la salle de bain'],
        ['task', 'Vider les poubelles'],
        ['check', 'Pas de dégât visible'],
        ['check', 'Équipements fonctionnels'],
      ],
    },
    {
      id: 'seed-template-depart',
      name: 'Remise en état départ',
      is_default: 0,
      items: [
        ['task', 'Dégivrer et nettoyer le réfrigérateur'],
        ['task', 'Nettoyer plaques et hotte'],
        ['task', 'Laver les vitres'],
        ['task', 'Changer la literie'],
        ['check', 'Murs sans trace'],
        ['check', 'Clés et badge récupérés'],
      ],
    },
  ] as const
  for (const template of templates) {
    add('cleaning_templates', {
      id: template.id,
      residence_id: R,
      name: template.name,
      is_default: template.is_default,
    })
    template.items.forEach(([kind, label], position) =>
      add('cleaning_template_items', {
        id: id('template-item'),
        residence_id: R,
        template_id: template.id,
        kind,
        label,
        position,
      }),
    )
  }
  for (const lot of withNotice)
    add('cleaning_lot_templates', { lot_id: lot, residence_id: R, template_id: 'seed-template-depart' })

  const priorities = ['normal', 'normal', 'high', 'normal', 'urgent', 'low'] as const
  const cleaningLots = lots.filter((lot) => !vacant.has(lot.id))
  for (let offset = -7; offset <= 7; offset++) {
    const day = addDays(today, offset)
    const weekday = new Date(day).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    const daily = Array.from({ length: 4 }, (_, slot) => cleaningLots[((offset + 7) * 4 + slot) % cleaningLots.length]!)
    daily.forEach((lot, slot) => {
      const template = withNotice.has(lot.id) ? templates[1] : templates[0]
      const taskId = id('cleaning')
      const agent = CLEANERS[slot % 2]!
      const done = offset < 0 || (offset === 0 && slot === 0)
      const issue = done && slot === 1 && offset % 2 === 0
      add('cleaning_tasks', {
        id: taskId,
        residence_id: R,
        lot_id: lot.id,
        agent_id: agent,
        day,
        template_name: template.name,
        note: slot === 2 ? 'Clé à récupérer à l’accueil' : '',
        priority: priorities[(slot + offset + 7) % priorities.length]!,
        position: offset >= 0 ? Math.floor(slot / 2) : null,
        created_by: MANAGER,
        created_at: at(addDays(day, -3), '08:00'),
      })
      template.items.forEach(([kind, label], position) => {
        const state = !done
          ? 'todo'
          : issue && kind === 'check' && position === template.items.length - 1
            ? 'issue'
            : 'done'
        add('cleaning_task_items', {
          id: id('cleaning-item'),
          residence_id: R,
          task_id: taskId,
          kind,
          label,
          position,
          state,
          note: state === 'issue' ? 'Robinet de la douche qui fuit' : '',
          updated_by: done ? agent : null,
          updated_at: done ? at(day, '11:30') : null,
        })
      })
      if (done)
        out.push(
          `UPDATE cleaning_tasks SET status='done',report=${literal(issue ? 'Anomalie signalée' : '')},completed_at='${at(day, '12:00')}',completed_by='${agent}' WHERE id='${taskId}';`,
        )
    })
  }

  const sources = [
    { name: 'Laverie', description: 'Machines à laver et sèche-linge', vat_mode: 'ttc', vat_rate: 2000, base: 98000 },
    { name: 'Parking', description: 'Places de parking souterrain', vat_mode: 'ttc', vat_rate: 2000, base: 145000 },
    { name: 'Petit-déjeuner', description: 'Formule du matin', vat_mode: 'ttc', vat_rate: 1000, base: 62000 },
    { name: 'Location de salle', description: 'Salle commune', vat_mode: 'ht', vat_rate: null, base: 30000 },
  ] as const
  for (const source of sources) {
    const sourceId = id('revenue-source')
    add('revenue_sources', {
      id: sourceId,
      residence_id: R,
      name: source.name,
      description: source.description,
      vat_mode: source.vat_mode,
      vat_rate: source.vat_rate,
    })
    for (let month = 12; month >= 1; month--) {
      const period = shiftMonth(today.slice(0, 8) + '01', -month).slice(0, 7)
      const amount = Math.round(source.base * (0.7 + ((month * 53) % 60) / 100))
      const net =
        source.vat_rate === null
          ? amount
          : Math.floor((2 * amount * 10000 + 10000 + source.vat_rate) / (2 * (10000 + source.vat_rate)))
      add('revenue_entries', {
        id: id('revenue'),
        residence_id: R,
        source_id: sourceId,
        period,
        amount_cents: amount,
        vat_mode: source.vat_mode,
        vat_rate: source.vat_rate,
        net_cents: net,
        vat_cents: source.vat_rate === null ? null : amount - net,
        actor_id: MANAGER,
        updated_at: at(shiftMonth(period + '-01', 1), '09:00'),
      })
    }
  }

  const places = [
    {
      id: 'seed-place-hall-a',
      name: 'Hall A',
      building_id: 'seed-building-a',
      description: 'Entrée principale et boîtes aux lettres',
    },
    { id: 'seed-place-laverie', name: 'Laverie', building_id: 'seed-building-a', description: 'Sous-sol' },
    { id: 'seed-place-chaufferie', name: 'Chaufferie', building_id: 'seed-building-a', description: '' },
    { id: 'seed-place-poubelles', name: 'Local poubelles', building_id: 'seed-building-b', description: 'Accès cour' },
    { id: 'seed-place-parking', name: 'Parking', building_id: null, description: 'Niveau -1' },
  ]
  for (const place of places) add('places', { ...place, residence_id: R })
  const suppliers = [
    {
      id: 'seed-supplier-plomberie',
      name: 'Plomberie Dumas',
      trades: 'Plomberie, chauffage',
      contact: 'Éric Dumas',
      phone: '04 72 00 00 01',
      email: 'contact@plomberie-dumas.test',
    },
    {
      id: 'seed-supplier-elec',
      name: 'Élec Services',
      trades: 'Électricité',
      contact: 'Nadia Benali',
      phone: '04 72 00 00 02',
      email: 'atelier@elec-services.test',
    },
    {
      id: 'seed-supplier-ascenseur',
      name: 'Ascenseurs Rhône',
      trades: 'Ascenseur',
      contact: 'Service client',
      phone: '04 72 00 00 03',
      email: 'sav@ascenseurs-rhone.test',
    },
  ]
  for (const supplier of suppliers) add('suppliers', { ...supplier, residence_id: R })

  const work = (row: {
    title: string
    description: string
    state: string
    priority: string
    planned: [string, string] | null
    actual: [string, string | null] | null
    locations: string[]
    suppliers: string[]
  }) => {
    const workId = id('work')
    add('works', {
      id: workId,
      residence_id: R,
      title: row.title,
      description: row.description,
      state: row.state,
      priority: row.priority,
      planned_start: row.planned?.[0] ?? null,
      planned_end: row.planned?.[1] ?? null,
      actual_start: row.actual?.[0] ?? null,
      actual_end: row.actual?.[1] ?? null,
      created_by: MANAGER,
      created_at: at(addDays(today, -30), '09:30'),
    })
    for (const location of row.locations) {
      const [kind, ref] = location.split(':')
      add('work_locations', {
        id: id('work-location'),
        residence_id: R,
        work_id: workId,
        lot_id: kind === 'lot' ? ref! : null,
        place_id: kind === 'place' ? ref! : null,
      })
    }
    for (const supplier of row.suppliers)
      add('work_suppliers', { residence_id: R, work_id: workId, supplier_id: supplier })
    return workId
  }
  const boiler = work({
    title: 'Remplacement du circulateur de chauffage',
    description: 'Bruit anormal et pression instable sur le circuit secondaire.',
    state: 'in_progress',
    priority: 'high',
    planned: [addDays(today, -5), addDays(today, 5)],
    actual: [addDays(today, -4), null],
    locations: ['place:seed-place-chaufferie'],
    suppliers: ['seed-supplier-plomberie'],
  })
  const lighting = work({
    title: 'Passage en LED des couloirs du bâtiment A',
    description: 'Remplacement des hublots des paliers.',
    state: 'open',
    priority: 'normal',
    planned: [addDays(today, 12), addDays(today, 16)],
    actual: null,
    locations: ['place:seed-place-hall-a'],
    suppliers: ['seed-supplier-elec'],
  })
  const shower = work({
    title: 'Reprise du joint de douche',
    description: 'Infiltration constatée lors du ménage.',
    state: 'done',
    priority: 'normal',
    planned: [addDays(today, -15), addDays(today, -14)],
    actual: [addDays(today, -15), addDays(today, -14)],
    locations: ['lot:seed-lot-a203'],
    suppliers: ['seed-supplier-plomberie'],
  })
  const note = (workId: string, kind: string, body: string, day: string) =>
    add('work_notes', {
      id: id('work-note'),
      residence_id: R,
      work_id: workId,
      kind,
      body,
      actor_id: MANAGER,
      created_at: at(day, '16:00'),
    })
  note(boiler, 'status', 'Travaux démarrés', addDays(today, -4))
  note(boiler, 'problem', 'Pièce en commande, livraison sous 5 jours.', addDays(today, -3))
  note(shower, 'status', 'Travaux terminés', addDays(today, -14))
  const intervention = (workId: string, supplier: string, day: string, time: string, status: string, report = '') =>
    add('interventions', {
      id: id('intervention'),
      residence_id: R,
      work_id: workId,
      supplier_id: supplier,
      starts_at: at(day, time),
      duration: 120,
      status,
      report,
      created_by: MANAGER,
      created_at: at(addDays(today, -20), '09:00'),
    })
  intervention(
    boiler,
    'seed-supplier-plomberie',
    addDays(today, -4),
    '08:30',
    'done',
    'Diagnostic effectué, circulateur HS.',
  )
  intervention(boiler, 'seed-supplier-plomberie', addDays(today, 2), '09:00', 'planned')
  intervention(lighting, 'seed-supplier-elec', addDays(today, 12), '08:00', 'planned')
  intervention(shower, 'seed-supplier-plomberie', addDays(today, -15), '14:00', 'done', 'Joint refait, séchage 24 h.')

  const issues = [
    {
      title: 'Fuite sous l’évier',
      lot: 'seed-lot-a105',
      place: null,
      priority: 'urgent',
      status: 'open',
      work: null,
      days: -1,
    },
    {
      title: 'Porte du hall qui ferme mal',
      lot: null,
      place: 'seed-place-hall-a',
      priority: 'high',
      status: 'open',
      work: null,
      days: -3,
    },
    {
      title: 'Radiateur froid',
      lot: 'seed-lot-a302',
      place: null,
      priority: 'high',
      status: 'open',
      work: boiler,
      days: -6,
    },
    {
      title: 'Sèche-linge n°2 en panne',
      lot: null,
      place: 'seed-place-laverie',
      priority: 'normal',
      status: 'open',
      work: null,
      days: -8,
    },
    {
      title: 'Ampoule grillée au palier',
      lot: null,
      place: 'seed-place-hall-a',
      priority: 'low',
      status: 'open',
      work: lighting,
      days: -10,
    },
    {
      title: 'Joint de douche noirci',
      lot: 'seed-lot-a203',
      place: null,
      priority: 'normal',
      status: 'resolved',
      work: shower,
      days: -18,
    },
    {
      title: 'Bruit de voisinage',
      lot: 'seed-lot-b03',
      place: null,
      priority: 'low',
      status: 'dismissed',
      work: null,
      days: -25,
    },
  ]
  for (const issue of issues)
    add('issues', {
      id: id('issue'),
      residence_id: R,
      title: issue.title,
      description: '',
      reported_on: addDays(today, issue.days),
      lot_id: issue.lot,
      place_id: issue.place,
      status: issue.status,
      priority: issue.priority,
      work_id: issue.work,
      created_by: issue.days % 2 ? MANAGER : CLEANERS[0],
      created_at: at(addDays(today, issue.days), '10:30'),
    })

  const points = [
    { zone: 'Hall', label: 'Éclairage fonctionnel', location: 'place:seed-place-hall-a' },
    { zone: 'Hall', label: 'Porte d’entrée verrouillée', location: 'place:seed-place-hall-a' },
    { zone: 'Sous-sol', label: 'Laverie propre et machines en service', location: 'place:seed-place-laverie' },
    { zone: 'Sous-sol', label: 'Pression chaudière entre 1 et 2 bars', location: 'place:seed-place-chaufferie' },
    { zone: 'Sécurité', label: 'Extincteurs en place', location: null },
  ]
  const lastWeek = addDays(today, -7)
  add('visit_templates', {
    id: 'seed-visit-template',
    residence_id: R,
    building_id: 'seed-building-a',
    name: 'Ronde hebdomadaire',
    frequency: 'weekly',
    first_due: lastWeek,
    points_json: JSON.stringify(points),
  })
  const visit = (scheduled: string, done: boolean) => {
    const visitId = id('visit')
    add('technical_visits', {
      id: visitId,
      residence_id: R,
      template_id: 'seed-visit-template',
      building_id: 'seed-building-a',
      name: 'Ronde hebdomadaire',
      frequency: 'weekly',
      scheduled_on: scheduled,
      created_by: MANAGER,
      created_at: at(addDays(scheduled, -7), '09:00'),
    })
    points.forEach((point, position) => {
      const state = !done ? 'pending' : position === 3 ? 'issue' : 'ok'
      add('visit_points', {
        id: id('visit-point'),
        residence_id: R,
        visit_id: visitId,
        position,
        zone: point.zone,
        label: point.label,
        location: point.location,
        state,
        note: state === 'issue' ? 'Pression à 0,8 bar' : '',
        actor_id: done ? MANAGER : null,
        checked_at: done ? at(scheduled, '10:00') : null,
      })
    })
    if (done)
      out.push(
        `UPDATE technical_visits SET status='done',completed_on='${scheduled}',completed_by='${MANAGER}',report='Pression chaudière basse, signalée.' WHERE id='${visitId}';`,
      )
  }
  visit(lastWeek, true)
  visit(today, false)

  add('feedback', {
    id: id('feedback'),
    residence_id: R,
    kind: 'idea',
    message: 'Pouvoir imprimer le planning ménage de la semaine.',
    author_id: CLEANERS[0],
    created_at: at(addDays(today, -6)),
  })
  add('feedback', {
    id: id('feedback'),
    residence_id: R,
    kind: 'feature',
    message: 'Recevoir un rappel la veille des états des lieux.',
    author_id: MANAGER,
    created_at: at(addDays(today, -2)),
  })

  return out.join('\n') + '\n'
}
