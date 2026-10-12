import { Context, Effect, Layer, Schema } from 'effect'
import { manager } from '../domain/CurrentUser.ts'
import type { Me } from '../domain/accounts.ts'
import { currentDay, now } from '../domain/clock.ts'
import { InvalidInput } from '../domain/errors.ts'
import { parseLocation } from '../domain/technical.ts'
import {
  nextVisitDate,
  VisitConflict,
  VisitNotFound,
  VisitPointInput,
  type VisitTemplateInput,
  type VisitTemplateSummary,
  type VisitTemplate,
  type VisitCreate,
  type VisitDirectCreate,
  type VisitPlan,
  type VisitPointUpdate,
  type VisitAction,
  type VisitSummary,
  type VisitPoint,
} from '../domain/visits.ts'
import { onViolation, sql, Sql, searchPattern, folded } from './Database.ts'

const PAGE_SIZE = 20
const audit = (me: Me, at: string, id: string, before: unknown, after: unknown) =>
  sql(
    'INSERT INTO visit_changes(id,residence_id,entity_id,actor_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    me.residenceId,
    id,
    me.id,
    before === null ? null : JSON.stringify(before),
    JSON.stringify(after),
    at,
  )
const locked = onViolation('visit_locked', () => new VisitConflict())
const incomplete = onViolation(
  'visit_incomplete',
  () => new InvalidInput({ message: 'Traitez tous les points et expliquez les anomalies et les points non vérifiés.' }),
)
const summary = `v.id,v.template_id,v.name,v.building_id,b.name AS building,v.frequency,v.scheduled_on,
  v.status,v.completed_on,COALESCE(u.name,'') AS actor,v.report,
  (SELECT COUNT(*) FROM visit_points p WHERE p.visit_id=v.id) AS total,
  (SELECT COUNT(*) FROM visit_points p WHERE p.visit_id=v.id AND p.state<>'pending') AS handled,
  (SELECT COUNT(*) FROM visit_points p WHERE p.visit_id=v.id AND p.state='issue') AS anomalies`
const visitFrom = `FROM technical_visits v JOIN buildings b ON b.id=v.building_id LEFT JOIN users u ON u.id=v.completed_by`
const templateSelect = `t.*,b.name AS building,
  (SELECT MAX(completed_on) FROM technical_visits v WHERE v.template_id=t.id AND v.status='done') AS last_completed,
  (SELECT id FROM technical_visits v WHERE v.template_id=t.id AND v.status='planned') AS planned_id,
  (SELECT scheduled_on FROM technical_visits v WHERE v.template_id=t.id AND v.status='planned') AS planned_on`
type TemplateRow = Omit<VisitTemplateSummary, 'archived' | 'next_due' | 'point_count'> & {
  archived: number
  points_json: string
}
const pointsOf = (row: TemplateRow) =>
  Schema.decodeUnknownSync(Schema.Array(VisitPointInput))(JSON.parse(row.points_json))
const templateOf = (row: TemplateRow): VisitTemplateSummary => ({
  id: row.id,
  name: row.name,
  building_id: row.building_id,
  building: row.building,
  frequency: row.frequency,
  first_due: row.first_due,
  archived: !!row.archived,
  last_completed: row.last_completed,
  next_due:
    row.archived || row.frequency === 'once'
      ? null
      : row.last_completed
        ? nextVisitDate(row.last_completed, row.frequency)
        : row.first_due,
  planned_id: row.planned_id,
  planned_on: row.planned_on,
  point_count: pointsOf(row).length,
})

const make = Effect.gen(function* () {
  const db = yield* Sql
  const template = Effect.fn('Visits.template')(function* (id: string) {
    const me = yield* manager
    const row = yield* db.first<TemplateRow>(
      sql(
        `SELECT ${templateSelect} FROM visit_templates t JOIN buildings b ON b.id=t.building_id WHERE t.id=? AND t.residence_id=?`,
        id,
        me.residenceId,
      ),
    )
    if (!row) return yield* new VisitNotFound()
    return { ...templateOf(row), points: pointsOf(row) } satisfies VisitTemplate
  })
  const templates = Effect.fn('Visits.templates')(function* (query: {
    building?: string
    archived?: string
    page?: number
  }) {
    const me = yield* manager
    const where = `t.residence_id=? AND t.archived=? ${query.building ? 'AND t.building_id=?' : ''}`
    const values = [me.residenceId, query.archived === 'yes' ? 1 : 0, ...(query.building ? [query.building] : [])]
    const count = yield* db.first<{ n: number }>(
      sql(`SELECT COUNT(*) AS n FROM visit_templates t WHERE ${where}`, ...values),
    )
    const rows = yield* db.all<TemplateRow>(
      sql(
        `SELECT ${templateSelect} FROM visit_templates t JOIN buildings b ON b.id=t.building_id WHERE ${where} ORDER BY b.name COLLATE NOCASE,t.name COLLATE NOCASE LIMIT ? OFFSET ?`,
        ...values,
        PAGE_SIZE,
        ((query.page ?? 1) - 1) * PAGE_SIZE,
      ),
    )
    return { items: rows.map(templateOf), total: count?.n ?? 0 }
  })
  const checkLocation = Effect.fn('Visits.checkLocation')(function* (ref: string | null, building: string) {
    if (!ref) return
    const me = yield* manager
    const { kind, id } = parseLocation(ref)
    const found = yield* db.first<{ id: string }>(
      sql(
        `SELECT id FROM ${kind === 'lot' ? 'lots' : 'places'} WHERE id=? AND residence_id=? AND archived=0 AND (building_id=? ${kind === 'place' ? 'OR building_id IS NULL' : ''})`,
        id,
        me.residenceId,
        building,
      ),
    )
    if (!found)
      return yield* new InvalidInput({
        message: 'Choisissez un lieu actif de ce bâtiment ou un lieu commun à la résidence.',
      })
  })
  const saveTemplate = Effect.fn('Visits.saveTemplate')(function* (
    id: string | null,
    input: typeof VisitTemplateInput.Type,
  ) {
    const me = yield* manager
    const previous = id ? yield* template(id) : null
    if (previous && previous.building_id !== input.building_id)
      return yield* new InvalidInput({ message: 'Le bâtiment d’un modèle ne se modifie pas. Créez un autre modèle.' })
    const building = yield* db.first(
      sql('SELECT id FROM buildings WHERE id=? AND residence_id=?', input.building_id, me.residenceId),
    )
    if (!building) return yield* new InvalidInput({ message: 'Choisissez un bâtiment de la résidence.' })
    if (input.frequency !== 'once' && !input.first_due)
      return yield* new InvalidInput({ message: 'Indiquez la première échéance.' })
    for (const point of input.points) yield* checkLocation(point.location, input.building_id)
    const savedId = id ?? crypto.randomUUID(),
      at = yield* now
    const data = { ...input, first_due: input.frequency === 'once' ? null : input.first_due }
    yield* db.batch([
      id
        ? sql(
            'UPDATE visit_templates SET name=?,frequency=?,first_due=?,archived=?,points_json=? WHERE id=? AND residence_id=?',
            data.name,
            data.frequency,
            data.first_due,
            Number(data.archived),
            JSON.stringify(data.points),
            id,
            me.residenceId,
          )
        : sql(
            'INSERT INTO visit_templates(id,residence_id,building_id,name,frequency,first_due,archived,points_json) VALUES(?,?,?,?,?,?,?,?)',
            savedId,
            me.residenceId,
            data.building_id,
            data.name,
            data.frequency,
            data.first_due,
            Number(data.archived),
            JSON.stringify(data.points),
          ),
      audit(me, at, savedId, previous, data),
    ])
    return { id: savedId }
  })
  const detail = Effect.fn('Visits.detail')(function* (id: string) {
    const me = yield* manager
    const row = yield* db.first<VisitSummary>(
      sql(`SELECT ${summary} ${visitFrom} WHERE v.id=? AND v.residence_id=?`, id, me.residenceId),
    )
    if (!row) return yield* new VisitNotFound()
    const points = yield* db.all<VisitPoint>(
      sql(
        `SELECT p.id,p.zone,p.label,p.location,p.state,p.note,p.issue_id,COALESCE(u.name,'') AS actor,p.checked_at FROM visit_points p LEFT JOIN users u ON u.id=p.actor_id WHERE p.visit_id=? AND p.residence_id=? ORDER BY p.position`,
        id,
        me.residenceId,
      ),
    )
    return { ...row, points }
  })
  const list = Effect.fn('Visits.list')(function* (query: {
    building?: string
    q?: string
    status?: string
    page?: number
  }) {
    const me = yield* manager
    const status = query.status ?? 'all'
    const where = `v.residence_id=? AND ${folded('v.name')} LIKE ? ESCAPE '\\' ${query.building ? 'AND v.building_id=?' : ''} ${status !== 'all' ? 'AND v.status=?' : ''}`
    const values = [
      me.residenceId,
      searchPattern(query.q),
      ...(query.building ? [query.building] : []),
      ...(status !== 'all' ? [status] : []),
    ]
    const count = yield* db.first<{ n: number }>(
      sql(`SELECT COUNT(*) AS n FROM technical_visits v WHERE ${where}`, ...values),
    )
    const items = yield* db.all<VisitSummary>(
      sql(
        `SELECT ${summary} ${visitFrom} WHERE ${where} ORDER BY v.status='planned' DESC,CASE WHEN v.status='planned' THEN v.scheduled_on END ASC,v.scheduled_on DESC,v.id LIMIT ? OFFSET ?`,
        ...values,
        PAGE_SIZE,
        ((query.page ?? 1) - 1) * PAGE_SIZE,
      ),
    )
    return { items, total: count?.n ?? 0 }
  })
  const createDirect = Effect.fn('Visits.createDirect')(function* (input: typeof VisitDirectCreate.Type) {
    const me = yield* manager
    const building = yield* db.first(
      sql('SELECT id FROM buildings WHERE id=? AND residence_id=?', input.building_id, me.residenceId),
    )
    if (!building) return yield* new InvalidInput({ message: 'Choisissez un bâtiment de la résidence.' })
    for (const point of input.points) yield* checkLocation(point.location, input.building_id)
    const previous = yield* db.first<{ id: string }>(
      sql(
        'SELECT id FROM visit_templates WHERE residence_id=? AND building_id=? AND name=? COLLATE NOCASE',
        me.residenceId,
        input.building_id,
        input.name,
      ),
    )
    const id = crypto.randomUUID(),
      templateId = previous?.id ?? crypto.randomUUID(),
      at = yield* now
    yield* db.batch([
      previous
        ? sql(
            'UPDATE visit_templates SET frequency=?,archived=0,points_json=? WHERE id=? AND residence_id=?',
            input.frequency,
            JSON.stringify(input.points),
            templateId,
            me.residenceId,
          )
        : sql(
            'INSERT INTO visit_templates(id,residence_id,building_id,name,frequency,first_due,points_json) VALUES(?,?,?,?,?,?,?)',
            templateId,
            me.residenceId,
            input.building_id,
            input.name,
            input.frequency,
            input.frequency === 'once' ? null : input.scheduled_on,
            JSON.stringify(input.points),
          ),
      sql(
        'INSERT INTO technical_visits(id,residence_id,template_id,building_id,name,frequency,scheduled_on,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        id,
        me.residenceId,
        templateId,
        input.building_id,
        input.name,
        input.frequency,
        input.scheduled_on,
        me.id,
        at,
      ),
      ...input.points.map((point, position) =>
        sql(
          'INSERT INTO visit_points(id,residence_id,visit_id,position,zone,label,location) VALUES(?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          id,
          position,
          point.zone,
          point.label,
          point.location,
        ),
      ),
      audit(me, at, id, null, input),
    ])
    return { id }
  })
  const create = Effect.fn('Visits.create')(function* (input: typeof VisitCreate.Type) {
    const me = yield* manager,
      model = yield* template(input.template_id)
    if (model.archived) return yield* new InvalidInput({ message: 'Ce modèle est archivé.' })
    for (const point of model.points) yield* checkLocation(point.location, model.building_id)
    const id = crypto.randomUUID(),
      at = yield* now
    yield* db.batch([
      sql(
        'INSERT INTO technical_visits(id,residence_id,template_id,building_id,name,frequency,scheduled_on,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        id,
        me.residenceId,
        model.id,
        model.building_id,
        model.name,
        model.frequency,
        input.scheduled_on,
        me.id,
        at,
      ),
      ...model.points.map((point, position) =>
        sql(
          'INSERT INTO visit_points(id,residence_id,visit_id,position,zone,label,location) VALUES(?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          id,
          position,
          point.zone,
          point.label,
          point.location,
        ),
      ),
      audit(me, at, id, null, input),
    ])
    return { id }
  })
  const plan = Effect.fn('Visits.plan')(function* (id: string, input: typeof VisitPlan.Type) {
    const me = yield* manager,
      visit = yield* detail(id)
    if (visit.status !== 'planned') return yield* new VisitConflict()
    yield* db
      .batch([
        sql(
          'UPDATE technical_visits SET scheduled_on=? WHERE id=? AND residence_id=?',
          input.scheduled_on,
          id,
          me.residenceId,
        ),
        audit(me, yield* now, id, visit, input),
      ])
      .pipe(locked)
    return { ok: true }
  })
  const updatePoint = Effect.fn('Visits.updatePoint')(function* (
    id: string,
    pointId: string,
    input: typeof VisitPointUpdate.Type,
  ) {
    const me = yield* manager,
      visit = yield* detail(id)
    const point = visit.points.find((p) => p.id === pointId)
    if (!point) return yield* new VisitNotFound()
    if (visit.status !== 'planned' || point.issue_id) return yield* new VisitConflict()
    if ((input.state === 'issue' || input.state === 'not_verified') && !input.note.trim())
      return yield* new InvalidInput({ message: 'Expliquez l’anomalie ou la raison du point non vérifié.' })
    const at = yield* now
    yield* db
      .batch([
        sql(
          'UPDATE visit_points SET state=?,note=?,actor_id=?,checked_at=? WHERE id=? AND visit_id=? AND residence_id=?',
          input.state,
          input.note,
          me.id,
          input.state === 'pending' ? null : at,
          pointId,
          id,
          me.residenceId,
        ),
        audit(me, at, pointId, point, input),
      ])
      .pipe(locked)
    return { ok: true }
  })
  const act = Effect.fn('Visits.act')(function* (id: string, input: typeof VisitAction.Type) {
    const me = yield* manager,
      visit = yield* detail(id),
      day = yield* currentDay
    if (visit.status !== 'planned') return yield* new VisitConflict()
    if (input.action === 'finish' && (!input.completed_on || input.completed_on > day))
      return yield* new InvalidInput({ message: 'Indiquez une date réelle de visite non future.' })
    const finished = input.action === 'finish'
    yield* db
      .batch([
        sql(
          'UPDATE technical_visits SET status=?,completed_on=?,completed_by=?,report=? WHERE id=? AND residence_id=?',
          finished ? 'done' : 'cancelled',
          finished ? input.completed_on : null,
          finished ? me.id : null,
          input.report,
          id,
          me.residenceId,
        ),
        audit(me, yield* now, id, visit, input),
      ])
      .pipe(locked, incomplete)
    return { ok: true }
  })
  const createIssue = Effect.fn('Visits.createIssue')(function* (id: string, pointId: string) {
    const me = yield* manager,
      visit = yield* detail(id)
    const point = visit.points.find((p) => p.id === pointId)
    if (!point) return yield* new VisitNotFound()
    if (point.state !== 'issue' || visit.status !== 'done')
      return yield* new InvalidInput({
        message: 'Terminez la visite avant de créer un signalement depuis une anomalie.',
      })
    if (point.issue_id) return { id: point.issue_id }
    const issueId = crypto.randomUUID(),
      at = yield* now
    const location = point.location ? parseLocation(point.location) : null
    const description = `${point.note}\nVisite « ${visit.name} » · ${visit.building} · ${point.zone}`
    yield* db
      .batch([
        sql(
          `INSERT INTO issues(id,residence_id,title,description,reported_on,lot_id,place_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
          issueId,
          me.residenceId,
          point.label,
          description,
          visit.completed_on,
          location?.kind === 'lot' ? location.id : null,
          location?.kind === 'place' ? location.id : null,
          me.id,
          at,
        ),
        sql(
          'UPDATE visit_points SET issue_id=? WHERE id=? AND visit_id=? AND residence_id=?',
          issueId,
          pointId,
          id,
          me.residenceId,
        ),
        audit(me, at, pointId, point, { issue_id: issueId }),
      ])
      .pipe(locked)
    return { id: issueId }
  })
  return { template, templates, saveTemplate, detail, list, createDirect, create, plan, updatePoint, act, createIssue }
})
export class Visits extends Context.Service<Visits, Effect.Success<typeof make>>()('gresidence/Visits') {
  static readonly layer = Layer.effect(Visits, make)
}
