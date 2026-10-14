import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import type { VisitAlreadyPlanned, VisitNotFound, VisitConflict } from '../domain/visits.ts'
import { Visits } from '../services/Visits.ts'
import { conflict, httpErrors, notFound } from './errors.ts'
const toHttp = httpErrors<VisitNotFound | VisitConflict | VisitAlreadyPlanned>({
  VisitNotFound: notFound('Visite, modèle ou point introuvable.'),
  VisitAlreadyPlanned: conflict(
    'Une visite de ce modèle est déjà prévue pour ce bâtiment. Terminez-la ou changez le titre.',
  ),
  VisitConflict: conflict('Cette visite est close ou ce point est déjà lié à un signalement. Rechargez la page.'),
})
export const VisitsLive = HttpApiBuilder.group(
  Api,
  'visits',
  Effect.fn(function* (handlers) {
    const visits = yield* Visits
    return handlers
      .handle('templates', ({ query }) => toHttp(visits.templates(query)))
      .handle('template', ({ params }) => toHttp(visits.template(params.id)))
      .handle('createTemplate', ({ payload }) => toHttp(visits.saveTemplate(null, payload)))
      .handle('updateTemplate', ({ params, payload }) => toHttp(visits.saveTemplate(params.id, payload)))
      .handle('list', ({ query }) => toHttp(visits.list(query)))
      .handle('createDirect', ({ payload }) => toHttp(visits.createDirect(payload)))
      .handle('create', ({ payload }) => toHttp(visits.create(payload)))
      .handle('detail', ({ params }) => toHttp(visits.detail(params.id)))
      .handle('plan', ({ params, payload }) => toHttp(visits.plan(params.id, payload)))
      .handle('point', ({ params, payload }) => toHttp(visits.updatePoint(params.id, params.pointId, payload)))
      .handle('act', ({ params, payload }) => toHttp(visits.act(params.id, payload)))
      .handle('issue', ({ params }) => toHttp(visits.createIssue(params.id, params.pointId)))
  }),
)
