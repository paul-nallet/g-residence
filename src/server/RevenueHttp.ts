import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import type { RevenueError } from '../domain/revenue.ts'
import { Revenue } from '../services/Revenue.ts'
import { conflict, httpErrors, notFound } from './errors.ts'

const toHttp = httpErrors<RevenueError>({
  RevenueSourceNotFound: notFound('Source de prestation introuvable.'),
  RevenueEntryNotFound: notFound('Saisie introuvable.'),
  RevenueSourceNameTaken: conflict('Une source de prestation porte déjà ce nom dans cette résidence.'),
  RevenuePeriodTaken: conflict('Le chiffre d’affaires de ce mois est déjà saisi. Corrigez-le depuis l’historique.'),
})

export const RevenueLive = HttpApiBuilder.group(
  Api,
  'revenue',
  Effect.fn(function* (handlers) {
    const revenue = yield* Revenue
    return handlers
      .handle('list', ({ query }) => toHttp(revenue.list(query)))
      .handle('year', ({ params }) => toHttp(revenue.year(params.year)))
      .handle('detail', ({ params }) => toHttp(revenue.source(params.id)))
      .handle('create', ({ payload }) => toHttp(revenue.create(payload)))
      .handle('update', ({ params, payload }) => toHttp(revenue.update(params.id, payload)))
      .handle('entries', ({ params, query }) => toHttp(revenue.entries(params.id, query.page)))
      .handle('record', ({ params, payload }) => toHttp(revenue.record(params.id, payload)))
      .handle('correct', ({ params, payload }) => toHttp(revenue.correct(params.id, params.entryId, payload)))
  }),
)
