import { Context, Effect, Layer } from 'effect'
import { manager } from '../domain/CurrentUser.ts'
import { currentDay, now } from '../domain/clock.ts'
import { InvalidInput } from '../domain/errors.ts'
import type { Me } from '../domain/accounts.ts'
import {
  PAGE_SIZE,
  type RevenueEntry,
  type RevenueEntryInput,
  RevenueEntryNotFound,
  RevenuePeriodTaken,
  type RevenueSource,
  type RevenueSourceInput,
  RevenueSourceNameTaken,
  RevenueSourceNotFound,
  revenueYear,
} from '../domain/revenue.ts'
import { onViolation, sql, Sql } from './Database.ts'

const latest = (column: string) =>
  `(SELECT e.${column} FROM revenue_entries e WHERE e.source_id=s.id AND e.residence_id=s.residence_id ORDER BY e.period DESC LIMIT 1)`
const sourceFields = `s.id,s.name,s.description,${latest('period')} AS latest_period,${latest('amount_cents')} AS latest_amount,
  (SELECT e.amount_cents FROM revenue_entries e WHERE e.source_id=s.id AND e.residence_id=s.residence_id AND e.period=?) AS month_amount`
const change =
  (table: 'revenue_source_changes' | 'revenue_entry_changes', column: 'source_id' | 'entry_id') =>
  (me: Me, at: string, id: string, before: unknown, after: unknown) =>
    sql(
      `INSERT INTO ${table}(id,residence_id,${column},actor_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)`,
      crypto.randomUUID(),
      me.residenceId,
      id,
      me.id,
      before === null ? null : JSON.stringify(before),
      JSON.stringify(after),
      at,
    )
const sourceChange = change('revenue_source_changes', 'source_id')
const entryChange = change('revenue_entry_changes', 'entry_id')
const sourceNameTaken = onViolation('UNIQUE constraint failed: revenue_sources.', () => new RevenueSourceNameTaken())
const periodTaken = onViolation('UNIQUE constraint failed: revenue_entries.', () => new RevenuePeriodTaken())

const notFuture = Effect.fn('Revenue.notFuture')(function* (period: string) {
  if (period > (yield* currentDay).slice(0, 7))
    return yield* new InvalidInput({ message: 'Le mois saisi ne peut pas être dans le futur.' })
})

const make = Effect.gen(function* () {
  const db = yield* Sql

  const find = Effect.fn('Revenue.find')(function* (id: string) {
    const me = yield* manager
    const source = yield* db.first<{ name: string; description: string }>(
      sql('SELECT name,description FROM revenue_sources WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!source) return yield* new RevenueSourceNotFound()
    return { me, before: source }
  })

  const list = Effect.fn('Revenue.list')(function* (input: {
    readonly month: string
    readonly pending?: 'true'
    readonly page?: number
  }) {
    const me = yield* manager
    const pending = input.pending ? 1 : 0
    const missing = `NOT EXISTS(SELECT 1 FROM revenue_entries e WHERE e.source_id=s.id AND e.residence_id=s.residence_id AND e.period=?)`
    const filter = `s.residence_id=? AND (?=0 OR ${missing})`
    const values = [me.residenceId, pending, input.month]
    const [items, count, waiting, sum] = yield* Effect.all([
      db.all<RevenueSource>(
        sql(
          `SELECT ${sourceFields} FROM revenue_sources s WHERE ${filter} ORDER BY s.name COLLATE NOCASE,s.id LIMIT ? OFFSET ?`,
          input.month,
          ...values,
          PAGE_SIZE,
          ((input.page ?? 1) - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(sql(`SELECT COUNT(*) AS total FROM revenue_sources s WHERE ${filter}`, ...values)),
      db.first<{ total: number }>(
        sql(
          `SELECT COUNT(*) AS total FROM revenue_sources s WHERE s.residence_id=? AND ${missing}`,
          me.residenceId,
          input.month,
        ),
      ),
      db.first<{ total: number }>(
        sql(
          'SELECT COALESCE(SUM(amount_cents),0) AS total FROM revenue_entries WHERE residence_id=? AND period=?',
          me.residenceId,
          input.month,
        ),
      ),
    ])
    return { items, total: count?.total ?? 0, pending: waiting?.total ?? 0, month_total: sum?.total ?? 0 }
  })

  const source = Effect.fn('Revenue.source')(function* (id: string) {
    const me = yield* manager
    const row = yield* db.first<RevenueSource>(
      sql(
        `SELECT ${sourceFields} FROM revenue_sources s WHERE s.id=? AND s.residence_id=?`,
        (yield* currentDay).slice(0, 7),
        id,
        me.residenceId,
      ),
    )
    if (!row) return yield* new RevenueSourceNotFound()
    return row
  })

  const create = Effect.fn('Revenue.create')(function* (input: typeof RevenueSourceInput.Type) {
    const me = yield* manager
    const id = crypto.randomUUID()
    yield* db
      .batch([
        sql(
          'INSERT INTO revenue_sources(id,residence_id,name,description) VALUES(?,?,?,?)',
          id,
          me.residenceId,
          input.name,
          input.description,
        ),
        sourceChange(me, yield* now, id, null, input),
      ])
      .pipe(sourceNameTaken)
    return { ok: true }
  })

  const update = Effect.fn('Revenue.update')(function* (id: string, input: typeof RevenueSourceInput.Type) {
    const { me, before } = yield* find(id)
    yield* db
      .batch([
        sql(
          'UPDATE revenue_sources SET name=?,description=? WHERE id=? AND residence_id=?',
          input.name,
          input.description,
          id,
          me.residenceId,
        ),
        sourceChange(me, yield* now, id, before, input),
      ])
      .pipe(sourceNameTaken)
    return { ok: true }
  })

  const entries = Effect.fn('Revenue.entries')(function* (id: string, page = 1) {
    const { me } = yield* find(id)
    const [items, count] = yield* Effect.all([
      db.all<RevenueEntry>(
        sql(
          `SELECT e.id,e.period,e.amount_cents,e.comment,u.name AS actor,e.updated_at
          FROM revenue_entries e JOIN users u ON u.id=e.actor_id
          WHERE e.source_id=? AND e.residence_id=? ORDER BY e.period DESC LIMIT ? OFFSET ?`,
          id,
          me.residenceId,
          PAGE_SIZE,
          (page - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(
        sql('SELECT COUNT(*) AS total FROM revenue_entries WHERE source_id=? AND residence_id=?', id, me.residenceId),
      ),
    ])
    return { items, total: count?.total ?? 0 }
  })

  const record = Effect.fn('Revenue.record')(function* (id: string, input: typeof RevenueEntryInput.Type) {
    const { me } = yield* find(id)
    yield* notFuture(input.period)
    const entryId = crypto.randomUUID(),
      at = yield* now
    yield* db
      .batch([
        sql(
          'INSERT INTO revenue_entries(id,residence_id,source_id,period,amount_cents,comment,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?)',
          entryId,
          me.residenceId,
          id,
          input.period,
          input.amount_cents,
          input.comment,
          me.id,
          at,
        ),
        entryChange(me, at, entryId, null, input),
      ])
      .pipe(periodTaken)
    return { ok: true }
  })

  const correct = Effect.fn('Revenue.correct')(function* (
    id: string,
    entryId: string,
    input: typeof RevenueEntryInput.Type,
  ) {
    const { me } = yield* find(id)
    const before = yield* db.first<{ period: string; amount_cents: number; comment: string }>(
      sql(
        'SELECT period,amount_cents,comment FROM revenue_entries WHERE id=? AND source_id=? AND residence_id=?',
        entryId,
        id,
        me.residenceId,
      ),
    )
    if (!before) return yield* new RevenueEntryNotFound()
    yield* notFuture(input.period)
    const at = yield* now
    yield* db
      .batch([
        sql(
          'UPDATE revenue_entries SET period=?,amount_cents=?,comment=?,actor_id=?,updated_at=? WHERE id=? AND residence_id=?',
          input.period,
          input.amount_cents,
          input.comment,
          me.id,
          at,
          entryId,
          me.residenceId,
        ),
        entryChange(me, at, entryId, before, input),
      ])
      .pipe(periodTaken)
    return { ok: true }
  })

  const year = Effect.fn('Revenue.year')(function* (value: number) {
    const me = yield* manager
    const [sources, rows] = yield* Effect.all([
      db.all<{ id: string; name: string }>(
        sql('SELECT id,name FROM revenue_sources WHERE residence_id=? ORDER BY name COLLATE NOCASE,id', me.residenceId),
      ),
      db.all<{ source_id: string; period: string; amount_cents: number }>(
        sql(
          'SELECT source_id,period,amount_cents FROM revenue_entries WHERE residence_id=? AND period BETWEEN ? AND ?',
          me.residenceId,
          `${value}-01`,
          `${value}-12`,
        ),
      ),
    ])
    return revenueYear(value, sources, rows)
  })

  return { list, source, create, update, entries, record, correct, year }
})

export class Revenue extends Context.Service<Revenue, Effect.Success<typeof make>>()('gresidence/Revenue') {
  static readonly layer = Layer.effect(Revenue, make)
}
