import { Context, Effect, Layer } from 'effect'
import { currentDay, now } from '../domain/clock.ts'
import { manager } from '../domain/CurrentUser.ts'
import { InvalidInput } from '../domain/errors.ts'
import {
  type Meter,
  type MeterInput,
  MeterNameTaken,
  MeterNotFound,
  PAGE_SIZE,
  type Reading,
  ReadingDateTaken,
  type ReadingInput,
  ReadingNotFound,
  unitMatchesKind,
} from '../domain/meters.ts'
import type { Me } from '../domain/accounts.ts'
import { consumptionYear } from '../domain/rules.ts'
import { onViolation, sql, Sql } from './Database.ts'

const meterColumns = (monthParameter: string) => `m.id,m.name,m.location,m.reference,m.kind,m.unit,
  (SELECT observed_on FROM meter_readings r WHERE r.meter_id=m.id AND r.residence_id=m.residence_id ORDER BY observed_on DESC LIMIT 1) AS latest_date,
  (SELECT value FROM meter_readings r WHERE r.meter_id=m.id AND r.residence_id=m.residence_id ORDER BY observed_on DESC LIMIT 1) AS latest_value,
  (SELECT observed_on FROM meter_readings r WHERE r.meter_id=m.id AND r.residence_id=m.residence_id AND substr(observed_on,1,7)=${monthParameter} ORDER BY observed_on DESC LIMIT 1) AS month_date`

const make = Effect.gen(function* () {
  const db = yield* Sql

  const find = Effect.fn('Meters.find')(function* (id: string) {
    const me = yield* manager
    const meter = yield* db.first<{ id: string }>(
      sql('SELECT id FROM meters WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!meter) return yield* new MeterNotFound()
    return me
  })

  const list = Effect.fn('Meters.list')(function* (month: string, page = 1, pending = false) {
    const me = yield* manager
    const filter = `m.residence_id=?1 AND (?2=0 OR NOT EXISTS(SELECT 1 FROM meter_readings r WHERE r.meter_id=m.id AND r.residence_id=m.residence_id AND substr(r.observed_on,1,7)=?3))`
    const [items, count] = yield* Effect.all([
      db.all<Meter>(
        sql(
          `SELECT ${meterColumns('?3')} FROM meters m WHERE ${filter} ORDER BY m.name COLLATE NOCASE,m.id LIMIT ${PAGE_SIZE} OFFSET ?4`,
          me.residenceId,
          pending ? 1 : 0,
          month,
          (page - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(
        sql(`SELECT COUNT(*) AS total FROM meters m WHERE ${filter}`, me.residenceId, pending ? 1 : 0, month),
      ),
    ])
    return { items, total: count?.total ?? 0 }
  })

  const detail = Effect.fn('Meters.detail')(function* (id: string) {
    const me = yield* manager
    const meter = yield* db.first<Meter>(
      sql(
        `SELECT ${meterColumns('?')} FROM meters m WHERE m.id=? AND m.residence_id=?`,
        (yield* currentDay).slice(0, 7),
        id,
        me.residenceId,
      ),
    )
    if (!meter) return yield* new MeterNotFound()
    return meter
  })

  const create = Effect.fn('Meters.create')(function* (input: typeof MeterInput.Type) {
    const me = yield* manager
    if (!unitMatchesKind(input.kind, input.unit))
      return yield* new InvalidInput({ message: 'Utilisez m³ pour l’eau et kWh pour l’électricité.' })
    yield* db
      .batch([
        sql(
          'INSERT INTO meters(id,residence_id,name,location,reference,kind,unit) VALUES(?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          input.name,
          input.location,
          input.reference,
          input.kind,
          input.unit,
        ),
      ])
      .pipe(onViolation('UNIQUE constraint failed: meters.', () => new MeterNameTaken()))
    return { ok: true }
  })

  const update = Effect.fn('Meters.update')(function* (id: string, input: typeof MeterInput.Type) {
    const me = yield* manager
    const before = yield* db.first<typeof MeterInput.Type & { readings: number }>(
      sql(
        `SELECT name,location,reference,kind,unit,EXISTS(SELECT 1 FROM meter_readings r WHERE r.meter_id=m.id AND r.residence_id=m.residence_id) AS readings
        FROM meters m WHERE id=? AND residence_id=?`,
        id,
        me.residenceId,
      ),
    )
    if (!before) return yield* new MeterNotFound()
    const { readings, ...previous } = before
    if (readings && (input.kind !== previous.kind || input.unit !== previous.unit))
      return yield* new InvalidInput({
        message: 'L’énergie et l’unité ne peuvent plus changer après un premier relevé. Créez un nouveau compteur.',
      })
    if (!unitMatchesKind(input.kind, input.unit))
      return yield* new InvalidInput({ message: 'Utilisez m³ pour l’eau et kWh pour l’électricité.' })
    yield* db
      .batch([
        sql(
          'UPDATE meters SET name=?,location=?,reference=?,kind=?,unit=? WHERE id=? AND residence_id=?',
          input.name,
          input.location,
          input.reference,
          input.kind,
          input.unit,
          id,
          me.residenceId,
        ),
        sql(
          'INSERT INTO history(id,residence_id,lot_id,actor_id,action,before_json,after_json,created_at) VALUES(?,?,NULL,?,?,?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          me.id,
          'Compteur corrigé',
          JSON.stringify({ id, ...previous }),
          JSON.stringify({ id, ...input }),
          yield* now,
        ),
      ])
      .pipe(onViolation('UNIQUE constraint failed: meters.', () => new MeterNameTaken()))
    return { ok: true }
  })

  const readings = Effect.fn('Meters.readings')(function* (id: string, page = 1) {
    const me = yield* find(id)
    const [items, count] = yield* Effect.all([
      db.all<Reading>(
        sql(
          `SELECT r.id,r.observed_on,r.value,u.name AS actor FROM meter_readings r JOIN users u ON u.id=r.actor_id
          WHERE r.meter_id=? AND r.residence_id=? ORDER BY r.observed_on DESC,r.id LIMIT ? OFFSET ?`,
          id,
          me.residenceId,
          PAGE_SIZE,
          (page - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(
        sql('SELECT COUNT(*) AS total FROM meter_readings WHERE meter_id=? AND residence_id=?', id, me.residenceId),
      ),
    ])
    return { items, total: count?.total ?? 0 }
  })

  const consumption = Effect.fn('Meters.consumption')(function* (id: string, year: number) {
    const me = yield* find(id)
    const rows = yield* db.all<{ observed_on: string; value: number }>(
      sql(
        `SELECT observed_on,value FROM meter_readings WHERE meter_id=?1 AND residence_id=?2 AND observed_on<=?4
        AND observed_on>=COALESCE((SELECT MAX(observed_on) FROM meter_readings WHERE meter_id=?1 AND residence_id=?2 AND observed_on<?3),?3)
        ORDER BY observed_on`,
        id,
        me.residenceId,
        `${year}-01-01`,
        `${year}-12-31`,
      ),
    )
    return consumptionYear(year, rows)
  })

  const record = Effect.fn('Meters.record')(function* (
    meterId: string,
    readingId: string | null,
    input: typeof ReadingInput.Type,
  ) {
    const me: Me = yield* find(meterId)
    if (input.observed_on > (yield* currentDay))
      return yield* new InvalidInput({ message: 'La date de constat ne peut pas être dans le futur.' })
    const before = readingId
      ? yield* db.first<{ observed_on: string; value: number }>(
          sql(
            'SELECT observed_on,value FROM meter_readings WHERE id=? AND meter_id=? AND residence_id=?',
            readingId,
            meterId,
            me.residenceId,
          ),
        )
      : null
    if (readingId && !before) return yield* new ReadingNotFound()
    const id = readingId ?? crypto.randomUUID()
    yield* db
      .batch([
        readingId
          ? sql(
              'UPDATE meter_readings SET observed_on=?,value=?,actor_id=? WHERE id=? AND meter_id=? AND residence_id=?',
              input.observed_on,
              input.value,
              me.id,
              id,
              meterId,
              me.residenceId,
            )
          : sql(
              'INSERT INTO meter_readings(id,residence_id,meter_id,observed_on,value,actor_id) VALUES(?,?,?,?,?,?)',
              id,
              me.residenceId,
              meterId,
              input.observed_on,
              input.value,
              me.id,
            ),
        sql(
          'INSERT INTO meter_reading_changes(id,residence_id,reading_id,actor_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          id,
          me.id,
          before ? JSON.stringify(before) : null,
          JSON.stringify({ observed_on: input.observed_on, value: input.value }),
          yield* now,
        ),
      ])
      .pipe(onViolation('UNIQUE constraint failed: meter_readings.', () => new ReadingDateTaken()))
    return { ok: true }
  })

  return { list, detail, create, update, readings, consumption, record }
})

export class Meters extends Context.Service<Meters, Effect.Success<typeof make>>()('gresidence/Meters') {
  static readonly layer = Layer.effect(Meters, make)
}
