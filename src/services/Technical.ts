import type { Priority } from '../domain/priority.ts'
import { Context, Effect, Layer } from 'effect'
import type { Me } from '../domain/accounts.ts'
import { currentDay, now } from '../domain/clock.ts'
import { manager } from '../domain/CurrentUser.ts'
import { InvalidInput } from '../domain/errors.ts'
import { appointmentInstant } from '../domain/rules.ts'
import {
  actionNotes,
  BuildingUnavailable,
  type Intervention,
  type InterventionInput,
  InterventionNotFound,
  isEmail,
  type Issue,
  type IssueInput,
  IssueLinked,
  IssueNotFound,
  type IssueStatus,
  type Location,
  LocationUnavailable,
  type NoteInput,
  PAGE_SIZE,
  parseLocation,
  type Place,
  type PlaceInput,
  PlaceNameTaken,
  PlaceNotFound,
  type Supplier,
  type SupplierInput,
  SupplierNameTaken,
  SupplierNotFound,
  SupplierUnavailable,
  type WorkAction,
  type WorkCreate,
  type WorkDetail,
  type WorkFilter,
  type WorkInput,
  WorkNotFound,
  type WorkNote,
  type WorkState,
  workStatus,
  type WorkSummary,
  workTransition,
} from '../domain/technical.ts'
import { onViolation, sql, Sql, type Statement } from './Database.ts'

type Entity = 'place' | 'supplier' | 'issue' | 'work' | 'intervention'
const change = (me: Me, at: string, entity: Entity, id: string, before: unknown, after: unknown) =>
  sql(
    'INSERT INTO technical_changes(id,residence_id,entity,entity_id,actor_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    me.residenceId,
    entity,
    id,
    me.id,
    before === null ? null : JSON.stringify(before),
    JSON.stringify(after),
    at,
  )
const pattern = (q?: string) => '%' + (q ?? '').trim().replace(/[\\%_]/g, '\\$&') + '%'
const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(',')
const labelOf = `CASE WHEN x.lot_id IS NOT NULL THEN 'Lot ' || l.number ELSE p.name END`
const workLocations = `(SELECT json_group_array(label) FROM (SELECT ${labelOf} AS label FROM work_locations x
  LEFT JOIN lots l ON l.id=x.lot_id LEFT JOIN places p ON p.id=x.place_id WHERE x.work_id=w.id
  ORDER BY x.lot_id IS NULL,l.number COLLATE NOCASE,p.name COLLATE NOCASE))`
const workSuppliers = `(SELECT json_group_array(name) FROM (SELECT s.name FROM work_suppliers ws JOIN suppliers s ON s.id=ws.supplier_id
  WHERE ws.work_id=w.id ORDER BY s.name COLLATE NOCASE))`
const statusOf = `CASE WHEN w.state='open' THEN CASE WHEN w.planned_start IS NULL THEN 'to_plan' ELSE 'planned' END ELSE w.state END`
const issueColumns = `i.id,i.title,i.description,i.reported_on,i.status,i.priority,i.work_id,w.title AS work_title,u.name AS actor,
  i.lot_id,l.number AS lot_number,l.archived AS lot_archived,i.place_id,p.name AS place_name,p.archived AS place_archived`
const issueJoins = `FROM issues i JOIN users u ON u.id=i.created_by LEFT JOIN works w ON w.id=i.work_id
  LEFT JOIN lots l ON l.id=i.lot_id LEFT JOIN places p ON p.id=i.place_id`

type IssueRow = Omit<Issue, 'location'> & {
  lot_id: string | null
  lot_number: string | null
  lot_archived: number | null
  place_id: string | null
  place_name: string | null
  place_archived: number | null
}
const issueOf = ({ lot_id, lot_number, lot_archived, place_id, place_name, place_archived, ...row }: IssueRow) => ({
  ...row,
  location: lot_id
    ? { ref: 'lot:' + lot_id, label: 'Lot ' + lot_number, archived: !!lot_archived }
    : place_id
      ? { ref: 'place:' + place_id, label: place_name ?? '', archived: !!place_archived }
      : null,
})
type SummaryRow = Omit<WorkSummary, 'locations' | 'suppliers'> & { locations: string; suppliers: string }
const summaryOf = (row: SummaryRow): WorkSummary => ({
  ...row,
  locations: JSON.parse(row.locations) as string[],
  suppliers: JSON.parse(row.suppliers) as string[],
})
const toBoolean = <A extends { archived: number | boolean }>(row: A) => ({ ...row, archived: !!row.archived })

const placeNameTaken = onViolation('UNIQUE constraint failed: places.', () => new PlaceNameTaken())
const supplierNameTaken = onViolation('UNIQUE constraint failed: suppliers.', () => new SupplierNameTaken())
const buildingScope = onViolation('building_scope', () => new BuildingUnavailable())
const locationScope = onViolation('location_unavailable', () => new LocationUnavailable())
const supplierScope = onViolation('intervention_supplier', () => new SupplierUnavailable())

const notFuture = (date: string, message: string) =>
  Effect.gen(function* () {
    if (date > (yield* currentDay)) return yield* new InvalidInput({ message })
  })

const relations = (
  me: Me,
  workId: string,
  locations: ReadonlyArray<{ kind: 'lot' | 'place'; id: string }>,
  supplierIds: ReadonlyArray<string>,
): Statement[] => [
  sql('DELETE FROM work_locations WHERE work_id=? AND residence_id=?', workId, me.residenceId),
  sql('DELETE FROM work_suppliers WHERE work_id=? AND residence_id=?', workId, me.residenceId),
  ...locations.map((location) =>
    sql(
      'INSERT INTO work_locations(id,residence_id,work_id,lot_id,place_id) VALUES(?,?,?,?,?)',
      crypto.randomUUID(),
      me.residenceId,
      workId,
      location.kind === 'lot' ? location.id : null,
      location.kind === 'place' ? location.id : null,
    ),
  ),
  ...supplierIds.map((supplierId) =>
    sql(
      'INSERT INTO work_suppliers(residence_id,work_id,supplier_id) VALUES(?,?,?)',
      me.residenceId,
      workId,
      supplierId,
    ),
  ),
]
const note = (me: Me, at: string, workId: string, kind: 'note' | 'problem' | 'status', body: string) =>
  sql(
    'INSERT INTO work_notes(id,residence_id,work_id,kind,body,actor_id,created_at) VALUES(?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    me.residenceId,
    workId,
    kind,
    body,
    me.id,
    at,
  )
const checkPlanning = (input: typeof WorkInput.Type) =>
  input.planned_start && input.planned_end && input.planned_end < input.planned_start
    ? Effect.fail(new InvalidInput({ message: 'La fin prévue ne peut pas précéder le début prévu.' }))
    : Effect.void

const make = Effect.gen(function* () {
  const db = yield* Sql

  const resolveLocations = Effect.fn('Technical.resolveLocations')(function* (
    me: Me,
    refs: ReadonlyArray<string>,
    current: ReadonlyArray<string> = [],
  ) {
    const unique = [...new Set(refs)].map(parseLocation)
    const lots = unique.filter((ref) => ref.kind === 'lot').map((ref) => ref.id),
      places = unique.filter((ref) => ref.kind === 'place').map((ref) => ref.id)
    const [lotRows, placeRows] = yield* Effect.all([
      lots.length
        ? db.all<{ id: string; archived: number }>(
            sql(
              `SELECT id,archived FROM lots WHERE residence_id=? AND id IN (${placeholders(lots.length)})`,
              me.residenceId,
              ...lots,
            ),
          )
        : Effect.succeed([]),
      places.length
        ? db.all<{ id: string; archived: number }>(
            sql(
              `SELECT id,archived FROM places WHERE residence_id=? AND id IN (${placeholders(places.length)})`,
              me.residenceId,
              ...places,
            ),
          )
        : Effect.succeed([]),
    ])
    const usable = (kind: string, rows: ReadonlyArray<{ id: string; archived: number }>) => (id: string) => {
      const row = rows.find((item) => item.id === id)
      return !!row && (!row.archived || current.includes(kind + ':' + id))
    }
    if (!lots.every(usable('lot', lotRows)) || !places.every(usable('place', placeRows)))
      return yield* new LocationUnavailable()
    return unique
  })

  const resolveSuppliers = Effect.fn('Technical.resolveSuppliers')(function* (
    me: Me,
    ids: ReadonlyArray<string>,
    current: ReadonlyArray<string> = [],
  ) {
    const unique = [...new Set(ids)]
    if (!unique.length) return unique
    const rows = yield* db.all<{ id: string; archived: number }>(
      sql(
        `SELECT id,archived FROM suppliers WHERE residence_id=? AND id IN (${placeholders(unique.length)})`,
        me.residenceId,
        ...unique,
      ),
    )
    const usable = (id: string) => {
      const row = rows.find((item) => item.id === id)
      return !!row && (!row.archived || current.includes(id))
    }
    if (!unique.every(usable)) return yield* new SupplierUnavailable()
    return unique
  })

  const options = Effect.fn('Technical.options')(function* () {
    const me = yield* manager
    const [lots, places, suppliers] = yield* Effect.all([
      db.all<{ id: string; number: string; building: string }>(
        sql(
          `SELECT l.id,l.number,COALESCE(b.name,'') AS building FROM lots l LEFT JOIN buildings b ON b.id=l.building_id
          WHERE l.residence_id=? AND l.archived=0 ORDER BY b.name COLLATE NOCASE,l.number COLLATE NOCASE`,
          me.residenceId,
        ),
      ),
      db.all<{ id: string; name: string; building: string }>(
        sql(
          `SELECT p.id,p.name,COALESCE(b.name,'') AS building FROM places p LEFT JOIN buildings b ON b.id=p.building_id
          WHERE p.residence_id=? AND p.archived=0 ORDER BY p.name COLLATE NOCASE`,
          me.residenceId,
        ),
      ),
      db.all<{ id: string; name: string; trades: string }>(
        sql(
          'SELECT id,name,trades FROM suppliers WHERE residence_id=? AND archived=0 ORDER BY name COLLATE NOCASE',
          me.residenceId,
        ),
      ),
    ])
    return {
      locations: [
        ...places.map((place) => ({
          ref: 'place:' + place.id,
          label: place.name,
          group: place.building ? 'Lieu · ' + place.building : 'Lieu',
        })),
        ...lots.map((lot) => ({ ref: 'lot:' + lot.id, label: 'Lot ' + lot.number, group: lot.building || 'Lot' })),
      ],
      suppliers,
    }
  })

  const findPlace = Effect.fn('Technical.findPlace')(function* (me: Me, id: string) {
    const place = yield* db.first<{ name: string; building_id: string | null; description: string; archived: number }>(
      sql('SELECT name,building_id,description,archived FROM places WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!place) return yield* new PlaceNotFound()
    return place
  })

  const places = Effect.fn('Technical.places')(function* () {
    const me = yield* manager
    const rows = yield* db.all<Omit<Place, 'archived'> & { archived: number }>(
      sql(
        `SELECT p.id,p.name,p.building_id,COALESCE(b.name,'') AS building_name,p.description,p.archived,
        (SELECT COUNT(*) FROM work_locations x JOIN works w ON w.id=x.work_id WHERE x.place_id=p.id AND w.state IN ('open','in_progress')) AS active_works,
        (SELECT COUNT(*) FROM issues i WHERE i.place_id=p.id AND i.status='open') AS open_issues
        FROM places p LEFT JOIN buildings b ON b.id=p.building_id WHERE p.residence_id=?
        ORDER BY p.archived,p.name COLLATE NOCASE`,
        me.residenceId,
      ),
    )
    return rows.map(toBoolean)
  })

  const savePlace = Effect.fn('Technical.savePlace')(function* (id: string | null, input: typeof PlaceInput.Type) {
    const me = yield* manager
    const before = id ? yield* findPlace(me, id) : null
    const placeId = id ?? crypto.randomUUID(),
      building = input.building_id || null
    yield* db
      .batch([
        before
          ? sql(
              'UPDATE places SET name=?,building_id=?,description=?,archived=? WHERE id=? AND residence_id=?',
              input.name,
              building,
              input.description,
              input.archived ? 1 : 0,
              placeId,
              me.residenceId,
            )
          : sql(
              'INSERT INTO places(id,residence_id,name,building_id,description,archived) VALUES(?,?,?,?,?,?)',
              placeId,
              me.residenceId,
              input.name,
              building,
              input.description,
              input.archived ? 1 : 0,
            ),
        change(me, yield* now, 'place', placeId, before, input),
      ])
      .pipe(placeNameTaken, buildingScope)
    return { id: placeId }
  })

  const findSupplier = Effect.fn('Technical.findSupplier')(function* (me: Me, id: string) {
    const supplier = yield* db.first<Omit<Supplier, 'archived'> & { archived: number }>(
      sql(
        `SELECT s.id,s.name,s.trades,s.contact,s.phone,s.email,s.notes,s.archived,
        (SELECT COUNT(*) FROM work_suppliers ws JOIN works w ON w.id=ws.work_id WHERE ws.supplier_id=s.id AND w.state IN ('open','in_progress')) AS active_works
        FROM suppliers s WHERE s.id=? AND s.residence_id=?`,
        id,
        me.residenceId,
      ),
    )
    if (!supplier) return yield* new SupplierNotFound()
    return toBoolean(supplier)
  })

  const suppliers = Effect.fn('Technical.suppliers')(function* (input: {
    readonly q?: string
    readonly archived?: 'no' | 'yes'
    readonly page?: number
  }) {
    const me = yield* manager
    const filter = `s.residence_id=? AND s.archived=? AND (s.name LIKE ? ESCAPE '\\' OR s.trades LIKE ? ESCAPE '\\' OR s.contact LIKE ? ESCAPE '\\')`
    const search = pattern(input.q),
      values = [me.residenceId, input.archived === 'yes' ? 1 : 0, search, search, search]
    const [rows, count] = yield* Effect.all([
      db.all<Omit<Supplier, 'archived'> & { archived: number }>(
        sql(
          `SELECT s.id,s.name,s.trades,s.contact,s.phone,s.email,s.notes,s.archived,
          (SELECT COUNT(*) FROM work_suppliers ws JOIN works w ON w.id=ws.work_id WHERE ws.supplier_id=s.id AND w.state IN ('open','in_progress')) AS active_works
          FROM suppliers s WHERE ${filter} ORDER BY s.name COLLATE NOCASE,s.id LIMIT ? OFFSET ?`,
          ...values,
          PAGE_SIZE,
          ((input.page ?? 1) - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(sql(`SELECT COUNT(*) AS total FROM suppliers s WHERE ${filter}`, ...values)),
    ])
    return { items: rows.map(toBoolean), total: count?.total ?? 0 }
  })

  const supplier = Effect.fn('Technical.supplier')(function* (id: string) {
    return yield* findSupplier(yield* manager, id)
  })

  const saveSupplier = Effect.fn('Technical.saveSupplier')(function* (
    id: string | null,
    input: typeof SupplierInput.Type,
  ) {
    const me = yield* manager
    if (input.email && !isEmail(input.email)) return yield* new InvalidInput({ message: 'Email invalide.' })
    const before = id ? yield* findSupplier(me, id) : null
    const supplierId = id ?? crypto.randomUUID()
    const values = [
      input.name,
      input.trades,
      input.contact,
      input.phone,
      input.email,
      input.notes,
      input.archived ? 1 : 0,
    ] as const
    yield* db
      .batch([
        before
          ? sql(
              'UPDATE suppliers SET name=?,trades=?,contact=?,phone=?,email=?,notes=?,archived=? WHERE id=? AND residence_id=?',
              ...values,
              supplierId,
              me.residenceId,
            )
          : sql(
              'INSERT INTO suppliers(name,trades,contact,phone,email,notes,archived,id,residence_id) VALUES(?,?,?,?,?,?,?,?,?)',
              ...values,
              supplierId,
              me.residenceId,
            ),
        change(me, yield* now, 'supplier', supplierId, before, input),
      ])
      .pipe(supplierNameTaken)
    return { id: supplierId }
  })

  const issues = Effect.fn('Technical.issues')(function* (input: {
    readonly q?: string
    readonly priority?: Priority
    readonly status?: 'all' | IssueStatus
    readonly page?: number
  }) {
    const me = yield* manager
    const status = input.status ?? 'all',
      search = pattern(input.q)
    const filter = `i.residence_id=? AND (?='all' OR i.status=?) AND (?='' OR i.priority=?) AND (i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\'
      OR ('Lot ' || l.number) LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')`
    const values = [
      me.residenceId,
      status,
      status,
      input.priority ?? '',
      input.priority ?? '',
      search,
      search,
      search,
      search,
    ]
    const [rows, count, open] = yield* Effect.all([
      db.all<IssueRow>(
        sql(
          `SELECT ${issueColumns} ${issueJoins} WHERE ${filter}
          ORDER BY i.status<>'open',CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,i.reported_on DESC,i.created_at DESC,i.id LIMIT ? OFFSET ?`,
          ...values,
          PAGE_SIZE,
          ((input.page ?? 1) - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(sql(`SELECT COUNT(*) AS total ${issueJoins} WHERE ${filter}`, ...values)),
      db.first<{ total: number }>(
        sql("SELECT COUNT(*) AS total FROM issues WHERE residence_id=? AND status='open'", me.residenceId),
      ),
    ])
    return { items: rows.map(issueOf), total: count?.total ?? 0, open: open?.total ?? 0 }
  })

  const findIssue = Effect.fn('Technical.findIssue')(function* (me: Me, id: string) {
    const row = yield* db.first<IssueRow>(
      sql(`SELECT ${issueColumns} ${issueJoins} WHERE i.id=? AND i.residence_id=?`, id, me.residenceId),
    )
    if (!row) return yield* new IssueNotFound()
    return issueOf(row)
  })

  const saveIssue = Effect.fn('Technical.saveIssue')(function* (id: string | null, input: typeof IssueInput.Type) {
    const me = yield* manager
    yield* notFuture(input.reported_on, 'La date de constat ne peut pas être dans le futur.')
    const before = id ? yield* findIssue(me, id) : null
    const [location] = input.location
      ? yield* resolveLocations(me, [input.location], before?.location ? [before.location.ref] : [])
      : []
    const lotId = location?.kind === 'lot' ? location.id : null,
      placeId = location?.kind === 'place' ? location.id : null
    const issueId = id ?? crypto.randomUUID(),
      at = yield* now
    yield* db
      .batch([
        before
          ? sql(
              'UPDATE issues SET title=?,description=?,reported_on=?,lot_id=?,place_id=?,status=?,priority=? WHERE id=? AND residence_id=?',
              input.title,
              input.description,
              input.reported_on,
              lotId,
              placeId,
              input.status,
              input.priority ?? before.priority,
              issueId,
              me.residenceId,
            )
          : sql(
              'INSERT INTO issues(id,residence_id,title,description,reported_on,lot_id,place_id,status,priority,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
              issueId,
              me.residenceId,
              input.title,
              input.description,
              input.reported_on,
              lotId,
              placeId,
              input.status,
              input.priority ?? 'normal',
              me.id,
              at,
            ),
        change(me, at, 'issue', issueId, before, {
          ...input,
          priority: input.priority ?? before?.priority ?? 'normal',
        }),
      ])
      .pipe(locationScope)
    return { id: issueId }
  })

  const works = Effect.fn('Technical.works')(function* (input: {
    readonly q?: string
    readonly priority?: Priority
    readonly status?: WorkFilter
    readonly location?: string
    readonly supplier?: string
    readonly page?: number
  }) {
    const me = yield* manager
    const status = input.status ?? 'active',
      search = pattern(input.q),
      location = input.location ? parseLocation(input.location) : null,
      supplierId = input.supplier ?? ''
    const filter = `w.residence_id=? AND (?='' OR w.priority=?)
      AND (?='all' OR (?='active' AND w.state IN ('open','in_progress')) OR ${statusOf}=?)
      AND (?='' OR EXISTS(SELECT 1 FROM work_locations x WHERE x.work_id=w.id AND (x.lot_id=? OR x.place_id=?)))
      AND (?='' OR EXISTS(SELECT 1 FROM work_suppliers ws WHERE ws.work_id=w.id AND ws.supplier_id=?))
      AND (w.title LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\'
        OR EXISTS(SELECT 1 FROM work_locations x LEFT JOIN lots l ON l.id=x.lot_id LEFT JOIN places p ON p.id=x.place_id
          WHERE x.work_id=w.id AND (${labelOf}) LIKE ? ESCAPE '\\')
        OR EXISTS(SELECT 1 FROM work_suppliers ws JOIN suppliers s ON s.id=ws.supplier_id WHERE ws.work_id=w.id AND s.name LIKE ? ESCAPE '\\'))`
    const locationId = location?.id ?? ''
    const values = [
      me.residenceId,
      input.priority ?? '',
      input.priority ?? '',
      status,
      status,
      status,
      locationId,
      location?.kind === 'lot' ? locationId : null,
      location?.kind === 'place' ? locationId : null,
      supplierId,
      supplierId,
      search,
      search,
      search,
      search,
    ]
    const [rows, count, active] = yield* Effect.all([
      db.all<SummaryRow>(
        sql(
          `SELECT w.id,w.title,w.priority,${statusOf} AS status,w.planned_start,w.planned_end,w.actual_start,w.actual_end,
          ${workLocations} AS locations,${workSuppliers} AS suppliers,
          (SELECT MIN(starts_at) FROM interventions i WHERE i.work_id=w.id AND i.status='planned' AND i.starts_at>=?) AS next_intervention
          FROM works w WHERE ${filter}
          ORDER BY w.state IN ('done','cancelled'),
            CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
            CASE w.state WHEN 'in_progress' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
            CASE WHEN w.state IN ('done','cancelled') THEN COALESCE(w.actual_end,w.created_at) END DESC,
            COALESCE(w.planned_start,'9999-12-31'),w.created_at DESC,w.id LIMIT ? OFFSET ?`,
          yield* now,
          ...values,
          PAGE_SIZE,
          ((input.page ?? 1) - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(sql(`SELECT COUNT(*) AS total FROM works w WHERE ${filter}`, ...values)),
      db.first<{ total: number }>(
        sql(
          "SELECT COUNT(*) AS total FROM works WHERE residence_id=? AND state IN ('open','in_progress')",
          me.residenceId,
        ),
      ),
    ])
    return { items: rows.map(summaryOf), total: count?.total ?? 0, active: active?.total ?? 0 }
  })

  const findWork = Effect.fn('Technical.findWork')(function* (me: Me, id: string) {
    const work = yield* db.first<{
      title: string
      description: string
      state: WorkState
      priority: Priority
      planned_start: string | null
      planned_end: string | null
      actual_start: string | null
      actual_end: string | null
    }>(
      sql(
        'SELECT title,description,state,priority,planned_start,planned_end,actual_start,actual_end FROM works WHERE id=? AND residence_id=?',
        id,
        me.residenceId,
      ),
    )
    if (!work) return yield* new WorkNotFound()
    const [locations, partners] = yield* Effect.all([
      db.all<{ lot_id: string | null; place_id: string | null }>(
        sql('SELECT lot_id,place_id FROM work_locations WHERE work_id=? AND residence_id=?', id, me.residenceId),
      ),
      db.all<{ supplier_id: string }>(
        sql('SELECT supplier_id FROM work_suppliers WHERE work_id=? AND residence_id=?', id, me.residenceId),
      ),
    ])
    return {
      ...work,
      locations: locations.map((row) => (row.lot_id ? 'lot:' + row.lot_id : 'place:' + row.place_id)),
      supplier_ids: partners.map((row) => row.supplier_id),
    }
  })

  const work = Effect.fn('Technical.work')(function* (id: string) {
    const me = yield* manager
    const row = yield* findWork(me, id)
    const [locations, partners, notes, interventions, linked] = yield* Effect.all([
      db.all<{ lot_id: string | null; place_id: string | null; label: string; archived: number }>(
        sql(
          `SELECT x.lot_id,x.place_id,${labelOf} AS label,COALESCE(l.archived,p.archived) AS archived FROM work_locations x
          LEFT JOIN lots l ON l.id=x.lot_id LEFT JOIN places p ON p.id=x.place_id WHERE x.work_id=? AND x.residence_id=?
          ORDER BY x.lot_id IS NULL,l.number COLLATE NOCASE,p.name COLLATE NOCASE`,
          id,
          me.residenceId,
        ),
      ),
      db.all<{ id: string; name: string; trades: string; phone: string; email: string; archived: number }>(
        sql(
          `SELECT s.id,s.name,s.trades,s.phone,s.email,s.archived FROM work_suppliers ws JOIN suppliers s ON s.id=ws.supplier_id
          WHERE ws.work_id=? AND ws.residence_id=? ORDER BY s.name COLLATE NOCASE`,
          id,
          me.residenceId,
        ),
      ),
      db.all<WorkNote>(
        sql(
          `SELECT n.id,n.kind,n.body,u.name AS actor,n.created_at FROM work_notes n JOIN users u ON u.id=n.actor_id
          WHERE n.work_id=? AND n.residence_id=? ORDER BY n.created_at DESC,n.rowid DESC`,
          id,
          me.residenceId,
        ),
      ),
      db.all<Intervention>(
        sql(
          `SELECT i.id,i.work_id,i.supplier_id,s.name AS supplier,i.starts_at,i.duration,i.status,i.report FROM interventions i
          LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE i.work_id=? AND i.residence_id=? ORDER BY i.starts_at DESC`,
          id,
          me.residenceId,
        ),
      ),
      db.all<{ id: string; title: string; status: IssueStatus }>(
        sql(
          'SELECT id,title,status FROM issues WHERE work_id=? AND residence_id=? ORDER BY reported_on DESC',
          id,
          me.residenceId,
        ),
      ),
    ])
    const detail: WorkDetail = {
      id,
      title: row.title,
      priority: row.priority,
      description: row.description,
      status: workStatus(row.state, row.planned_start),
      planned_start: row.planned_start,
      planned_end: row.planned_end,
      actual_start: row.actual_start,
      actual_end: row.actual_end,
      locations: locations.map((location): Location => ({
        ref: location.lot_id ? 'lot:' + location.lot_id : 'place:' + location.place_id,
        label: location.label,
        archived: !!location.archived,
      })),
      suppliers: partners.map(toBoolean),
      notes,
      interventions,
      issues: linked,
    }
    return detail
  })

  const createWork = Effect.fn('Technical.createWork')(function* (input: typeof WorkCreate.Type) {
    const me = yield* manager
    yield* checkPlanning(input)
    const locations = yield* resolveLocations(me, input.locations),
      supplierIds = yield* resolveSuppliers(me, input.supplier_ids)
    const issue = input.issue_id ? yield* findIssue(me, input.issue_id) : null
    if (issue && (issue.status !== 'open' || issue.work_id)) return yield* new IssueLinked()
    const priority = input.priority ?? issue?.priority ?? 'normal'
    const workId = crypto.randomUUID(),
      at = yield* now
    yield* db
      .batch([
        sql(
          'INSERT INTO works(id,residence_id,title,description,priority,planned_start,planned_end,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          workId,
          me.residenceId,
          input.title,
          input.description,
          priority,
          input.planned_start,
          input.planned_end,
          me.id,
          at,
        ),
        ...relations(me, workId, locations, supplierIds),
        note(
          me,
          at,
          workId,
          'status',
          issue ? `Chantier créé depuis le signalement « ${issue.title} »` : 'Chantier créé',
        ),
        ...(issue
          ? [
              sql(
                "UPDATE issues SET work_id=? WHERE id=? AND residence_id=? AND status='open' AND work_id IS NULL",
                workId,
                issue.id,
                me.residenceId,
              ),
            ]
          : []),
        change(me, at, 'work', workId, null, { ...input, priority }),
      ])
      .pipe(locationScope)
    return { id: workId }
  })

  const updateWork = Effect.fn('Technical.updateWork')(function* (id: string, input: typeof WorkInput.Type) {
    const me = yield* manager
    yield* checkPlanning(input)
    const before = yield* findWork(me, id)
    const locations = yield* resolveLocations(me, input.locations, before.locations),
      supplierIds = yield* resolveSuppliers(me, input.supplier_ids, before.supplier_ids)
    yield* db
      .batch([
        sql(
          'UPDATE works SET title=?,description=?,priority=?,planned_start=?,planned_end=? WHERE id=? AND residence_id=?',
          input.title,
          input.description,
          input.priority ?? before.priority,
          input.planned_start,
          input.planned_end,
          id,
          me.residenceId,
        ),
        ...relations(me, id, locations, supplierIds),
        change(me, yield* now, 'work', id, before, { ...input, priority: input.priority ?? before.priority }),
      ])
      .pipe(locationScope)
    return { ok: true }
  })

  const actWork = Effect.fn('Technical.actWork')(function* (id: string, input: typeof WorkAction.Type) {
    const me = yield* manager
    const before = yield* findWork(me, id)
    const next = workTransition(before, input.action, input.date, yield* currentDay)
    if (typeof next === 'string') return yield* new InvalidInput({ message: next })
    const at = yield* now
    yield* db.batch([
      sql(
        'UPDATE works SET state=?,actual_start=?,actual_end=? WHERE id=? AND residence_id=?',
        next.state,
        next.actual_start,
        next.actual_end,
        id,
        me.residenceId,
      ),
      note(me, at, id, 'status', actionNotes[input.action] + (input.comment ? ' — ' + input.comment : '')),
      ...(input.action === 'finish'
        ? [
            sql(
              "UPDATE issues SET status='resolved' WHERE work_id=? AND residence_id=? AND status='open'",
              id,
              me.residenceId,
            ),
          ]
        : []),
      ...(input.action === 'finish' || input.action === 'cancel'
        ? [
            sql(
              "UPDATE interventions SET status='cancelled' WHERE work_id=? AND residence_id=? AND status='planned' AND starts_at>?",
              id,
              me.residenceId,
              at,
            ),
          ]
        : []),
      ...(input.action === 'cancel'
        ? [
            sql(
              "UPDATE issues SET work_id=NULL WHERE work_id=? AND residence_id=? AND status='open'",
              id,
              me.residenceId,
            ),
          ]
        : []),
      change(me, at, 'work', id, before, { ...next, comment: input.comment }),
    ])
    return { ok: true }
  })

  const addNote = Effect.fn('Technical.addNote')(function* (id: string, input: typeof NoteInput.Type) {
    const me = yield* manager
    yield* findWork(me, id)
    yield* db.batch([note(me, yield* now, id, input.kind, input.body)])
    return { ok: true }
  })

  const saveIntervention = Effect.fn('Technical.saveIntervention')(function* (
    target: { readonly work: string } | { readonly intervention: string },
    input: typeof InterventionInput.Type,
  ) {
    const me = yield* manager
    const before =
      'intervention' in target
        ? yield* db.first<{ work_id: string; supplier_id: string | null; starts_at: string; status: string }>(
            sql(
              'SELECT work_id,supplier_id,starts_at,status FROM interventions WHERE id=? AND residence_id=?',
              target.intervention,
              me.residenceId,
            ),
          )
        : null
    if ('intervention' in target && !before) return yield* new InterventionNotFound()
    const workId = before?.work_id ?? ('work' in target ? target.work : '')
    const owner = yield* findWork(me, workId)
    if ((!before || input.status === 'planned') && (owner.state === 'done' || owner.state === 'cancelled'))
      return yield* new InvalidInput({ message: 'Ce chantier est clos. Rouvrez-le pour planifier une intervention.' })
    const instant = appointmentInstant(input.local_start)
    if (!instant)
      return yield* new InvalidInput({
        message: 'Cet horaire est inexistant ou ambigu lors du changement d’heure. Choisissez un autre horaire.',
      })
    if (input.status === 'done' && instant > (yield* now))
      return yield* new InvalidInput({ message: 'Une intervention future ne peut pas être déclarée réalisée.' })
    const interventionId = 'intervention' in target ? target.intervention : crypto.randomUUID(),
      supplierId = input.supplier_id || null,
      at = yield* now
    const closing = input.status !== 'planned' && before?.status !== input.status
    const dateLabel = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(instant))
    yield* db
      .batch([
        before
          ? sql(
              'UPDATE interventions SET supplier_id=?,starts_at=?,duration=?,status=?,report=? WHERE id=? AND residence_id=?',
              supplierId,
              instant,
              input.duration,
              input.status,
              input.report,
              interventionId,
              me.residenceId,
            )
          : sql(
              'INSERT INTO interventions(id,residence_id,work_id,supplier_id,starts_at,duration,status,report,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
              interventionId,
              me.residenceId,
              workId,
              supplierId,
              instant,
              input.duration,
              input.status,
              input.report,
              me.id,
              at,
            ),
        ...(closing
          ? [
              note(
                me,
                at,
                workId,
                'status',
                `Intervention du ${dateLabel} ${input.status === 'done' ? 'réalisée' : 'annulée'}` +
                  (input.report ? ' — ' + input.report : ''),
              ),
            ]
          : []),
        change(me, at, 'intervention', interventionId, before, input),
      ])
      .pipe(supplierScope)
    return { ok: true }
  })

  return {
    options,
    places,
    savePlace,
    suppliers,
    supplier,
    saveSupplier,
    issues,
    saveIssue,
    works,
    work,
    createWork,
    updateWork,
    actWork,
    addNote,
    saveIntervention,
  }
})

export class Technical extends Context.Service<Technical, Effect.Success<typeof make>>()('gresidence/Technical') {
  static readonly layer = Layer.effect(Technical, make)
}
