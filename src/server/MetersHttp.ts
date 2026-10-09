import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import type { MetersError } from '../domain/meters.ts'
import { Meters } from '../services/Meters.ts'
import { conflict, httpErrors, notFound } from './errors.ts'

const toHttp = httpErrors<MetersError>({
  MeterNotFound: notFound('Compteur introuvable.'),
  ReadingNotFound: notFound('Relevé introuvable.'),
  MeterNameTaken: conflict('Un compteur porte déjà ce nom dans cette résidence.'),
  ReadingDateTaken: conflict('Un relevé existe déjà à cette date. Corrigez-le depuis l’historique.'),
})

export const MetersLive = HttpApiBuilder.group(
  Api,
  'meters',
  Effect.fn(function* (handlers) {
    const meters = yield* Meters
    return handlers
      .handle('list', ({ query }) => toHttp(meters.list(query.month, query.page, query.pending === 'true')))
      .handle('detail', ({ params }) => toHttp(meters.detail(params.id)))
      .handle('create', ({ payload }) => toHttp(meters.create(payload)))
      .handle('readings', ({ params, query }) => toHttp(meters.readings(params.id, query.page)))
      .handle('consumption', ({ params, query }) => toHttp(meters.consumption(params.id, query.year)))
      .handle('record', ({ params, payload }) => toHttp(meters.record(params.id, null, payload)))
      .handle('correct', ({ params, payload }) => toHttp(meters.record(params.id, params.readingId, payload)))
  }),
)
