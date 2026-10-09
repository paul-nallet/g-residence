import { Effect, Predicate, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'
import { Api, issueMessage } from '../../src/api/Api.ts'

export const SESSION_EXPIRED = 'gresidence:expired'
const makeClient = HttpApiClient.make(Api, { baseUrl: window.location.origin }).pipe(
  Effect.provide(FetchHttpClient.layer),
)
export type Client = Effect.Success<typeof makeClient>
export const messageOf = (error: unknown) =>
  Predicate.hasProperty(error, 'error') && Predicate.isString(error.error)
    ? error.error
    : Schema.isSchemaError(error)
      ? issueMessage(error.issue)
      : error instanceof Error && !Predicate.hasProperty(error, '_tag')
        ? error.message
        : 'Impossible de contacter le serveur.'
export const call = <A, E>(f: (client: Client) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    makeClient.pipe(
      Effect.flatMap(f),
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (Predicate.isTagged(error, 'Unauthorized')) window.dispatchEvent(new Event(SESSION_EXPIRED))
        }),
      ),
      Effect.mapError((error) => new Error(messageOf(error))),
    ),
  )
