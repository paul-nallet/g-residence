import { Context, Effect, Layer } from 'effect'
import { CurrentUser } from '../domain/CurrentUser.ts'
import { sql, Sql } from './Database.ts'

export const versionStatement = (residenceId: string) =>
  sql('SELECT version FROM residence_sync WHERE residence_id=?', residenceId)

const make = Effect.gen(function* () {
  const db = yield* Sql

  const state = Effect.fn('Sync.state')(function* () {
    const me = yield* CurrentUser
    const row = yield* db.first<{ version: number }>(versionStatement(me.residenceId))
    return { version: row?.version ?? 0 }
  })

  return { state }
})

export class Sync extends Context.Service<Sync, Effect.Success<typeof make>>()('gresidence/Sync') {
  static readonly layer = Layer.effect(Sync, make)
}
