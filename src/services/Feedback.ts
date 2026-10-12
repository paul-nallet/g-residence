import { Context, Effect, Layer } from 'effect'
import { now } from '../domain/clock.ts'
import { CurrentUser } from '../domain/CurrentUser.ts'
import { type FeedbackEntry, type FeedbackInput, type FeedbackKind, PAGE_SIZE } from '../domain/feedback.ts'
import { sql, Sql } from './Database.ts'

const make = Effect.gen(function* () {
  const db = yield* Sql

  const list = Effect.fn('Feedback.list')(function* (query: { kind?: FeedbackKind; page?: number }) {
    const me = yield* CurrentUser
    const page = query.page ?? 1
    const filter = 'f.residence_id=?1 AND (?2 IS NULL OR f.author_id=?2) AND (?3 IS NULL OR f.kind=?3)'
    const author = me.role === 'cleaner' ? me.id : null,
      kind = query.kind ?? null
    const [items, count] = yield* Effect.all([
      db.all<FeedbackEntry>(
        sql(
          `SELECT f.id,f.kind,f.message,u.name AS author,f.created_at FROM feedback f JOIN users u ON u.id=f.author_id
          WHERE ${filter} ORDER BY f.created_at DESC,f.id LIMIT ${PAGE_SIZE} OFFSET ?4`,
          me.residenceId,
          author,
          kind,
          (page - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(
        sql(`SELECT COUNT(*) AS total FROM feedback f WHERE ${filter}`, me.residenceId, author, kind),
      ),
    ])
    return { items, total: count?.total ?? 0 }
  })

  const create = Effect.fn('Feedback.create')(function* (input: typeof FeedbackInput.Type) {
    const me = yield* CurrentUser
    yield* db.batch([
      sql(
        'INSERT INTO feedback(id,residence_id,kind,message,author_id,created_at) VALUES(?,?,?,?,?,?)',
        crypto.randomUUID(),
        me.residenceId,
        input.kind,
        input.message,
        me.id,
        yield* now,
      ),
    ])
    return { ok: true }
  })

  return { list, create }
})

export class Feedback extends Context.Service<Feedback, Effect.Success<typeof make>>()('gresidence/Feedback') {
  static readonly layer = Layer.effect(Feedback, make)
}
