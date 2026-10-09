import { Effect } from 'effect'
import { HttpServerResponse } from 'effect/http'
import { HttpApiError } from 'effect/http-api'
import { BadRequest, Conflict, Forbidden, issueMessage, NotFound, TooManyRequests, Unauthorized } from '../api/Api.ts'
import type { AdminOnly, ManagementOnly } from '../domain/CurrentUser.ts'
import type { InvalidInput } from '../domain/errors.ts'
import { describeSqlFailure, SqlError } from '../services/Database.ts'

type HttpError = BadRequest | Unauthorized | Forbidden | NotFound | Conflict | TooManyRequests

const storageFailure = (cause: unknown) => new Error('Une opération de stockage a échoué.', { cause })
const genericSqlError = (cause: unknown) => {
  const message = describeSqlFailure(cause)
  if (message.includes('UNIQUE'))
    return new Conflict({ error: 'Cette valeur existe déjà ou une autre saisie a été enregistrée. Rechargez la page.' })
  if (message.includes('CHECK')) return new BadRequest({ error: 'Les dates ou valeurs saisies sont incohérentes.' })
  if (message.includes('FOREIGN KEY'))
    return new Conflict({ error: 'La donnée a changé. Rechargez la page avant de réessayer.' })
  return undefined
}
export const sqlFailure = (error: SqlError) => {
  const failure = genericSqlError(error.cause)
  return failure ? Effect.fail(failure) : Effect.die(storageFailure(error.cause))
}

export const badRequest = (error: string) => () => new BadRequest({ error })
export const unauthorized = (error: string) => () => new Unauthorized({ error })
export const forbidden = (error: string) => () => new Forbidden({ error })
export const notFound = (error: string) => () => new NotFound({ error })
export const conflict = (error: string) => () => new Conflict({ error })
export const tooManyRequests = (error: string) => () => new TooManyRequests({ error })

const common = {
  ManagementOnly: forbidden('Action réservée à la gestion.'),
  AdminOnly: forbidden('Action réservée aux administrateurs.'),
  InvalidInput: (error: InvalidInput) => new BadRequest({ error: error.message }),
}
export const managementOnly = () => Effect.fail(common.ManagementOnly())

type Tagged = { readonly _tag: string }
type Cases<E extends Tagged> = { readonly [K in E['_tag']]: (error: Extract<E, { readonly _tag: K }>) => HttpError }
type Common = ManagementOnly | AdminOnly | InvalidInput

export const httpErrors =
  <E extends Tagged>(cases: Cases<Exclude<E, Common>>) =>
  <A, R>(effect: Effect.Effect<A, E | Common | SqlError, R>): Effect.Effect<A, HttpError, R> =>
    Effect.catch(effect, (error): Effect.Effect<never, HttpError> => {
      if (error instanceof SqlError) return sqlFailure(error)
      const handlers = { ...cases, ...common } as unknown as Record<string, (error: Tagged) => HttpError>
      return Effect.fail(handlers[error._tag]!(error))
    })

const requestKinds = new Set(['Params', 'Headers', 'Query', 'Payload'])
export const schemaErrorsAsBadRequest = <E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
  Effect.catchDefect(effect, (defect) =>
    HttpApiError.HttpApiSchemaError.is(defect) && requestKinds.has(defect.kind)
      ? Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { _tag: 'BadRequest', error: issueMessage(defect.cause.issue) },
            { status: 400 },
          ),
        )
      : Effect.die(defect),
  )
