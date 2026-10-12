import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import type { TechnicalError } from '../domain/technical.ts'
import { Technical } from '../services/Technical.ts'
import { badRequest, conflict, httpErrors, notFound } from './errors.ts'

const toHttp = httpErrors<TechnicalError>({
  PlaceNotFound: notFound('Lieu introuvable.'),
  PlaceNameTaken: conflict('Un lieu porte déjà ce nom.'),
  SupplierNotFound: notFound('Fournisseur introuvable.'),
  SupplierNameTaken: conflict('Un fournisseur porte déjà ce nom.'),
  SupplierUnavailable: badRequest('Choisissez un fournisseur actif rattaché à ce chantier.'),
  IssueNotFound: notFound('Signalement introuvable.'),
  IssueLinked: conflict('Ce signalement est clos ou déjà rattaché à des travaux.'),
  WorkNotFound: notFound('Chantier introuvable.'),
  InterventionNotFound: notFound('Intervention introuvable.'),
  LocationUnavailable: badRequest('Choisissez un lot ou un lieu actif de la résidence.'),
  BuildingUnavailable: badRequest('Choisissez un bâtiment de la résidence.'),
})

export const TechnicalLive = HttpApiBuilder.group(
  Api,
  'technical',
  Effect.fn(function* (handlers) {
    const technical = yield* Technical
    return handlers
      .handle('options', () => toHttp(technical.options()))
      .handle('places', () => toHttp(technical.places()))
      .handle('createPlace', ({ payload }) => toHttp(technical.savePlace(null, payload)))
      .handle('updatePlace', ({ params, payload }) => toHttp(technical.savePlace(params.id, payload)))
      .handle('suppliers', ({ query }) => toHttp(technical.suppliers(query)))
      .handle('supplier', ({ params }) => toHttp(technical.supplier(params.id)))
      .handle('createSupplier', ({ payload }) => toHttp(technical.saveSupplier(null, payload)))
      .handle('updateSupplier', ({ params, payload }) => toHttp(technical.saveSupplier(params.id, payload)))
      .handle('issues', ({ query }) => toHttp(technical.issues(query)))
      .handle('createIssue', ({ payload }) => toHttp(technical.saveIssue(null, payload)))
      .handle('updateIssue', ({ params, payload }) => toHttp(technical.saveIssue(params.id, payload)))
      .handle('works', ({ query }) => toHttp(technical.works(query)))
      .handle('work', ({ params }) => toHttp(technical.work(params.id)))
      .handle('createWork', ({ payload }) => toHttp(technical.createWork(payload)))
      .handle('updateWork', ({ params, payload }) => toHttp(technical.updateWork(params.id, payload)))
      .handle('actWork', ({ params, payload }) => toHttp(technical.actWork(params.id, payload)))
      .handle('addNote', ({ params, payload }) => toHttp(technical.addNote(params.id, payload)))
      .handle('createIntervention', ({ params, payload }) =>
        toHttp(technical.saveIntervention({ work: params.id }, payload)),
      )
      .handle('updateIntervention', ({ params, payload }) =>
        toHttp(technical.saveIntervention({ intervention: params.id }, payload)),
      )
  }),
)
