import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import { Studio } from '../services/Studio.ts'
import { badRequest, serviceUnavailable } from './errors.ts'

export const StudioLive = HttpApiBuilder.group(
  Api,
  'studio',
  Effect.fn(function* (handlers) {
    const studio = yield* Studio
    return handlers
      .handle('status', () => studio.status)
      .handle('ask', ({ payload }) =>
        studio.ask(payload.messages, payload.route).pipe(
          Effect.catchTags({
            AiUnavailable: () =>
              Effect.fail(serviceUnavailable('Aucun fournisseur IA n’est configuré pour cette installation.')()),
            AiFailed: (error) =>
              Effect.fail(serviceUnavailable('Le fournisseur IA n’a pas répondu : ' + error.reason)()),
            AiTooManySteps: () =>
              Effect.fail(badRequest('La demande nécessite trop d’étapes. Reformulez-la plus précisément.')()),
          }),
        ),
      )
  }),
)
