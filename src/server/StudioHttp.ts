import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import { Studio } from '../services/Studio.ts'
import { Voice } from '../services/Voice.ts'
import { badRequest, serviceUnavailable } from './errors.ts'

const providerErrors = {
  AiUnavailable: () =>
    Effect.fail(serviceUnavailable('Aucun fournisseur IA n’est configuré pour cette installation.')()),
  VoiceUnavailable: () =>
    Effect.fail(serviceUnavailable('Aucun fournisseur vocal n’est configuré pour cette installation.')()),
  AiFailed: (error: { reason: string }) =>
    Effect.fail(serviceUnavailable('Le fournisseur IA n’a pas répondu : ' + error.reason)()),
}

export const StudioLive = HttpApiBuilder.group(
  Api,
  'studio',
  Effect.fn(function* (handlers) {
    const studio = yield* Studio
    const voice = yield* Voice
    return handlers
      .handle('status', () => studio.status)
      .handle('ask', ({ payload }) =>
        studio.ask(payload.messages, payload.route).pipe(
          Effect.catchTags({
            AiUnavailable: providerErrors.AiUnavailable,
            AiFailed: providerErrors.AiFailed,
            AiTooManySteps: () =>
              Effect.fail(badRequest('La demande nécessite trop d’étapes. Reformulez-la plus précisément.')()),
          }),
        ),
      )
      .handle('transcribe', ({ payload }) =>
        voice
          .transcribe(payload.audio, payload.mime)
          .pipe(
            Effect.catchTags({ VoiceUnavailable: providerErrors.VoiceUnavailable, AiFailed: providerErrors.AiFailed }),
          ),
      )
      .handle('speak', ({ payload }) =>
        voice
          .speak(payload.text)
          .pipe(
            Effect.catchTags({ VoiceUnavailable: providerErrors.VoiceUnavailable, AiFailed: providerErrors.AiFailed }),
          ),
      )
  }),
)
