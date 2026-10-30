import { Effect, Predicate, Schema } from 'effect'
import { FetchHttpClient, HttpClientError } from 'effect/http'
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
export class NetworkError extends Error {}
export const isNetworkError = (error: unknown) => error instanceof NetworkError
const isTransport = (error: unknown) =>
  HttpClientError.isHttpClientError(error) && error.reason._tag === 'TransportError'
export const call = <A, E>(f: (client: Client) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    makeClient.pipe(
      Effect.flatMap(f),
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (Predicate.isTagged(error, 'Unauthorized')) window.dispatchEvent(new Event(SESSION_EXPIRED))
        }),
      ),
      Effect.mapError((error) =>
        isTransport(error)
          ? new NetworkError('Connexion impossible : vérifiez le réseau.')
          : new Error(messageOf(error)),
      ),
    ),
  )
