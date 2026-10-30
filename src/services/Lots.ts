import { Context, Effect, Layer } from 'effect'
import { currentDay, now } from '../domain/clock.ts'
import { CurrentUser, manager } from '../domain/CurrentUser.ts'
import {
  type Building,
  BuildingNameTaken,
  LotNumberTaken,
  BuildingNotFound,
  BuildingOutOfScope,
  BuildingRequired,
  DETAIL_AGENDA_DAYS,
  type History,
  type Lot,
  LotHasActiveStays,
  type LotInput,
  LotNotFound,
  type LotQuery,
  type LotRow,
  PAGE_SIZE,
} from '../domain/lots.ts'
import type { Inspection, Notice, Stay } from '../domain/stays.ts'
import { addDays } from '../domain/rules.ts'
import { Agenda } from './Agenda.ts'
import { folded, onViolation, searchPattern, sql, Sql, type SqlError } from './Database.ts'
import { auditStatement } from './History.ts'

type Query = { readonly [K in keyof typeof LotQuery]?: (typeof LotQuery)[K]['Type'] }

const occupancy =
  "CASE WHEN EXISTS(SELECT 1 FROM stays s WHERE s.lot_id=l.id AND s.cancelled=0 AND s.actual_start IS NOT NULL AND s.actual_end IS NULL) THEN 'occupied' WHEN EXISTS(SELECT 1 FROM stays s WHERE s.lot_id=l.id AND s.cancelled=0 AND s.actual_start IS NULL) THEN 'planned' ELSE 'vacant' END"
const lotColumns = `l.id,l.number,l.floor,l.type,l.archived,l.building_id,(SELECT name FROM buildings WHERE id=l.building_id AND residence_id=l.residence_id) AS building_name,${occupancy} AS occupancy,l.cleanliness,l.cleanliness_at`
const currentStay =
  '(SELECT s.id FROM stays s WHERE s.lot_id=l.id AND s.cancelled=0 AND s.actual_end IS NULL ORDER BY s.actual_start IS NULL,s.planned_start LIMIT 1)'
const rowColumns = (hidden: boolean) =>
  `${lotColumns},${hidden ? "''" : `COALESCE((SELECT first_name || ' ' || last_name FROM stays WHERE id=${currentStay}),'')`} AS resident,
  (SELECT COALESCE(actual_start,planned_start) FROM stays WHERE id=${currentStay}) AS stay_start,
  (SELECT planned_end FROM stays WHERE id=${currentStay}) AS stay_end,
  EXISTS(SELECT 1 FROM notices n WHERE n.stay_id=${currentStay} AND n.withdrawn=0) AS notice`
const stayFields = 'id,lot_id,first_name,last_name,planned_start,planned_end,actual_start,actual_end,cancelled'
const noticeFields = 'id,stay_id,received_on,departure_on,comment,withdrawn'
const inspectionFields = 'id,stay_id,kind,starts_at,duration,status,completed_on,comment'

const buildingViolations = <A, E, R>(self: Effect.Effect<A, E | SqlError, R>) =>
  self.pipe(
    onViolation('building_required', () => new BuildingRequired()),
    onViolation('building_scope', () => new BuildingOutOfScope()),
  )

const make = Effect.gen(function* () {
  const db = yield* Sql
  const agenda = yield* Agenda

  const find = Effect.fn('Lots.find')(function* (id: string) {
    const me = yield* CurrentUser
    const row = yield* db.first<Lot>(
      sql(`SELECT ${lotColumns} FROM lots l WHERE l.id=? AND l.residence_id=?`, id, me.residenceId),
    )
    if (!row) return yield* new LotNotFound()
    return row
  })

  const buildings = Effect.fn('Lots.buildings')(function* () {
    const me = yield* CurrentUser
    return yield* db.all<Building>(
      sql('SELECT id,name FROM buildings WHERE residence_id=? ORDER BY name COLLATE NOCASE,id', me.residenceId),
    )
  })

  const createBuilding = Effect.fn('Lots.createBuilding')(function* (input: { name: string }) {
    const me = yield* manager
    yield* db
      .batch([
        sql(
          'INSERT INTO buildings(id,residence_id,name) VALUES(?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          input.name,
        ),
      ])
      .pipe(onViolation('UNIQUE constraint failed: buildings.', () => new BuildingNameTaken()))
    return { ok: true }
  })

  const list = Effect.fn('Lots.list')(function* (input: Query) {
    const me = yield* CurrentUser
    const page = input.page ?? 1
    const search = searchPattern(input.q)
    const state = input.state ?? 'all',
      building = input.building ?? 'all',
      cleanliness = input.cleanliness ?? 'all'
    const filter = `l.residence_id=? AND l.archived=? AND (${folded('l.number')} LIKE ? ESCAPE '\\' OR ${folded('l.floor')} LIKE ? ESCAPE '\\' OR ${folded('l.type')} LIKE ? ESCAPE '\\' OR l.id IN (SELECT lot_id FROM (SELECT s.lot_id,${folded("(s.first_name || ' ' || s.last_name)")} AS resident FROM stays s WHERE ?=0 AND s.residence_id=? AND s.cancelled=0 AND s.actual_end IS NULL) WHERE resident LIKE ? ESCAPE '\\')) AND (?='all' OR ${occupancy}=?) AND (?='all' OR l.building_id=?) AND (?='all' OR (l.cleanliness=? AND (l.cleanliness='out_of_service' OR ${occupancy}<>'occupied')))`
    const values = [
      me.residenceId,
      input.archived === 'yes' ? 1 : 0,
      search,
      search,
      search,
      me.role === 'cleaner' ? 1 : 0,
      me.residenceId,
      search,
      state,
      state,
      building,
      building,
      cleanliness,
      cleanliness,
    ]
    const sort = input.sort === 'floor' ? 'l.floor COLLATE NOCASE,l.number COLLATE NOCASE' : 'l.number COLLATE NOCASE'
    const [count, items] = yield* Effect.all([
      db.first<{ total: number }>(sql(`SELECT COUNT(*) AS total FROM lots l WHERE ${filter}`, ...values)),
      db.all<LotRow>(
        sql(
          `SELECT ${rowColumns(me.role === 'cleaner')} FROM lots l WHERE ${filter} ORDER BY ${sort},l.id LIMIT ? OFFSET ?`,
          ...values,
          PAGE_SIZE,
          (page - 1) * PAGE_SIZE,
        ),
      ),
    ])
    return { items, total: count?.total ?? 0, page, pageSize: PAGE_SIZE }
  })

  const detail = Effect.fn('Lots.detail')(function* (id: string) {
    const me = yield* CurrentUser
    const lot = yield* find(id)
    const from = yield* currentDay
    const events = yield* agenda.calendar(from, addDays(from, DETAIL_AGENDA_DAYS), id)
    if (me.role === 'cleaner') return { lot, stays: [], notices: [], inspections: [], history: [], events }
    const [stays, notices, inspections, history] = yield* Effect.all([
      db.all<Stay>(
        sql(
          `SELECT ${stayFields} FROM stays WHERE lot_id=? AND residence_id=? ORDER BY planned_start DESC,id`,
          id,
          me.residenceId,
        ),
      ),
      db.all<Notice>(
        sql(
          `SELECT ${noticeFields} FROM notices WHERE residence_id=? AND stay_id IN(SELECT id FROM stays WHERE lot_id=?) ORDER BY received_on DESC`,
          me.residenceId,
          id,
        ),
      ),
      db.all<Inspection>(
        sql(
          `SELECT ${inspectionFields} FROM inspections WHERE residence_id=? AND stay_id IN(SELECT id FROM stays WHERE lot_id=?) ORDER BY starts_at`,
          me.residenceId,
          id,
        ),
      ),
      db.all<typeof History.Type>(
        sql(
          'SELECT h.id,h.action,u.name AS actor,h.created_at,h.before_json,h.after_json FROM history h JOIN users u ON u.id=h.actor_id WHERE h.lot_id=? AND h.residence_id=? ORDER BY h.created_at DESC,h.id DESC',
          id,
          me.residenceId,
        ),
      ),
    ])
    return { lot, stays, notices, inspections, history, events }
  })

  const save = Effect.fn('Lots.save')(function* (id: string | null, input: typeof LotInput.Type) {
    const me = yield* manager
    const before = id ? yield* find(id) : null,
      lotId = id ?? crypto.randomUUID()
    if (
      !(yield* db.first(
        sql('SELECT id FROM buildings WHERE id=? AND residence_id=?', input.building_id, me.residenceId),
      ))
    )
      return yield* new BuildingNotFound()
    const data = { building_id: input.building_id, number: input.number, floor: input.floor, type: input.type }
    yield* db
      .batch([
        id
          ? sql(
              'UPDATE lots SET number=?,floor=?,type=?,building_id=? WHERE id=? AND residence_id=?',
              data.number,
              data.floor,
              data.type,
              data.building_id,
              id,
              me.residenceId,
            )
          : sql(
              'INSERT INTO lots(id,residence_id,number,floor,type,building_id) VALUES(?,?,?,?,?,?)',
              lotId,
              me.residenceId,
              data.number,
              data.floor,
              data.type,
              data.building_id,
            ),
        auditStatement(me, yield* now, lotId, id ? 'Lot corrigé' : 'Lot créé', before, data),
      ])
      .pipe(
        buildingViolations,
        onViolation('UNIQUE constraint failed: lots.', () => new LotNumberTaken()),
      )
    return { ok: true }
  })

  const archive = Effect.fn('Lots.archive')(function* (id: string, archived: boolean) {
    const me = yield* manager
    const before = yield* find(id)
    if (
      archived &&
      (yield* db.first(sql('SELECT id FROM stays WHERE lot_id=? AND cancelled=0 AND actual_end IS NULL', id)))
    )
      return yield* new LotHasActiveStays()
    yield* db.batch([
      sql('UPDATE lots SET archived=? WHERE id=? AND residence_id=?', Number(archived), id, me.residenceId),
      auditStatement(me, yield* now, id, archived ? 'Lot archivé' : 'Lot restauré', before, { archived }),
    ])
    return { ok: true }
  })

  return {
    buildings,
    createBuilding,
    list,
    detail,
    create: (input: typeof LotInput.Type) => save(null, input),
    update: save,
    archive,
  }
})

export class Lots extends Context.Service<Lots, Effect.Success<typeof make>>()('gresidence/Lots') {
  static readonly layer = Layer.effect(Lots, make)
}
