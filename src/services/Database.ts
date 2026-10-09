import { Context, Effect, Layer, Schema } from 'effect'

export type Value = string | number | null
export type Statement = { sql: string; values: Value[] }
export const sql = (query: string, ...values: Value[]): Statement => ({ sql: query, values })
export interface DatabasePort {
  all<A>(statement: Statement): Promise<A[]>
  first<A>(statement: Statement): Promise<A | null>
  batch(statements: Statement[]): Promise<void>
}
export class Database extends Context.Service<Database, DatabasePort>()('gresidence/Database') {}
export const d1Database = (binding: D1Database): DatabasePort => ({
  all: async <A>(statement: Statement) =>
    (
      await binding
        .prepare(statement.sql)
        .bind(...statement.values)
        .all<A>()
    ).results,
  first: <A>(statement: Statement) =>
    binding
      .prepare(statement.sql)
      .bind(...statement.values)
      .first<A>(),
  batch: async (statements) => {
    await binding.batch(statements.map((statement) => binding.prepare(statement.sql).bind(...statement.values)))
  },
})

export const describeSqlFailure = (cause: unknown) =>
  String(cause) + (cause instanceof Error ? String(cause.cause ?? '') : '')

export class SqlError extends Schema.TaggedError<SqlError>()('SqlError', { cause: Schema.Defect() }) {
  violates(constraint: string) {
    return describeSqlFailure(this.cause).includes(constraint)
  }
}

export const onViolation =
  <E>(constraint: string, error: () => E) =>
  <A, E2, R>(self: Effect.Effect<A, E2 | SqlError, R>): Effect.Effect<A, E | E2 | SqlError, R> =>
    Effect.catchIf(
      self,
      (failure): failure is SqlError => failure instanceof SqlError && failure.violates(constraint),
      () => Effect.fail(error()),
    )

const attempt = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: (cause) => new SqlError({ cause }) })

export class Sql extends Context.Service<
  Sql,
  {
    all<A>(statement: Statement): Effect.Effect<A[], SqlError>
    first<A>(statement: Statement): Effect.Effect<A | null, SqlError>
    batch(statements: Statement[]): Effect.Effect<void, SqlError>
  }
>()('gresidence/Sql') {
  static readonly layer = Layer.effect(
    Sql,
    Effect.gen(function* () {
      const db = yield* Database
      return Sql.of({
        all: (statement) => attempt(() => db.all(statement)),
        first: (statement) => attempt(() => db.first(statement)),
        batch: (statements) => attempt(() => db.batch(statements)),
      })
    }),
  )
}
