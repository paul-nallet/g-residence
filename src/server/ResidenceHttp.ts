import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import type { LotsError } from '../domain/lots.ts'
import type { StaysError } from '../domain/stays.ts'
import { Agenda } from '../services/Agenda.ts'
import { Lots } from '../services/Lots.ts'
import { Stays } from '../services/Stays.ts'
import { badRequest, conflict, httpErrors, notFound } from './errors.ts'

const lotErrors = {
  LotNotFound: notFound('Lot introuvable.'),
  BuildingNotFound: notFound('Bâtiment introuvable dans cette résidence.'),
  BuildingNameTaken: conflict('Un bâtiment porte déjà ce nom dans cette résidence.'),
  LotNumberTaken: conflict('Un lot porte déjà ce numéro dans cette résidence.'),
  BuildingRequired: badRequest('Choisissez un bâtiment pour le lot.'),
  BuildingOutOfScope: conflict('Le bâtiment doit appartenir à la résidence du lot.'),
  LotHasActiveStays: conflict('Terminez ou annulez les séjours avant d’archiver le lot.'),
}
const lotsHttp = httpErrors<LotsError>(lotErrors)
const staysHttp = httpErrors<StaysError>({
  LotNotFound: lotErrors.LotNotFound,
  StayNotFound: notFound('Séjour introuvable.'),
  NoticeNotFound: notFound('Préavis actif introuvable.'),
  InspectionNotFound: notFound('Rendez-vous introuvable.'),
  LotArchived: conflict('Le lot est archivé.'),
  LotUnavailable: conflict('Le lot est archivé ou indisponible.'),
  StayCancelled: conflict('Le séjour est annulé.'),
  StayClosed: conflict('Ce séjour est terminé ou annulé.'),
  StayStarted: conflict('Un séjour commencé ne peut pas être annulé.'),
  StayOverlap: conflict('Ce séjour chevauche une autre occupation du lot.'),
  PreviousOccupantPresent: conflict('Confirmez la sortie réelle de l’occupant précédent avant une nouvelle entrée.'),
  DepartureFromNotice: conflict('Corrigez la date de départ depuis le préavis actif.'),
})
const agendaHttp = httpErrors<never>({})

export const BuildingsLive = HttpApiBuilder.group(
  Api,
  'buildings',
  Effect.fn(function* (handlers) {
    const lots = yield* Lots
    return handlers
      .handle('list', () => lotsHttp(lots.buildings()))
      .handle('create', ({ payload }) => lotsHttp(lots.createBuilding(payload)))
  }),
)

export const LotsLive = HttpApiBuilder.group(
  Api,
  'lots',
  Effect.fn(function* (handlers) {
    const lots = yield* Lots
    return handlers
      .handle('list', ({ query }) => lotsHttp(lots.list(query)))
      .handle('detail', ({ params }) => lotsHttp(lots.detail(params.id)))
      .handle('create', ({ payload }) => lotsHttp(lots.create(payload)))
      .handle('update', ({ params, payload }) => lotsHttp(lots.update(params.id, payload)))
      .handle('archive', ({ params, payload }) => lotsHttp(lots.archive(params.id, payload.archived)))
  }),
)

export const StaysLive = HttpApiBuilder.group(
  Api,
  'stays',
  Effect.fn(function* (handlers) {
    const stays = yield* Stays
    return handlers
      .handle('create', ({ params, payload }) => staysHttp(stays.createStay(params.id, payload)))
      .handle('update', ({ params, payload }) => staysHttp(stays.updateStay(params.id, payload)))
      .handle('action', ({ params, payload }) => staysHttp(stays.stayAction(params.id, payload)))
  }),
)

export const NoticesLive = HttpApiBuilder.group(
  Api,
  'notices',
  Effect.fn(function* (handlers) {
    const stays = yield* Stays
    return handlers
      .handle('create', ({ params, payload }) => staysHttp(stays.createNotice(params.id, payload)))
      .handle('update', ({ params, payload }) => staysHttp(stays.updateNotice(params.id, payload)))
      .handle('withdraw', ({ params }) => staysHttp(stays.withdrawNotice(params.id)))
  }),
)

export const InspectionsLive = HttpApiBuilder.group(
  Api,
  'inspections',
  Effect.fn(function* (handlers) {
    const stays = yield* Stays
    return handlers
      .handle('create', ({ params, payload }) => staysHttp(stays.createInspection(params.id, payload)))
      .handle('update', ({ params, payload }) => staysHttp(stays.updateInspection(params.id, payload)))
  }),
)

export const CalendarLive = HttpApiBuilder.group(
  Api,
  'calendar',
  Effect.fn(function* (handlers) {
    const agenda = yield* Agenda
    return handlers.handle('list', ({ query }) => agendaHttp(agenda.calendar(query.from, query.to)))
  }),
)

export const ReportsLive = HttpApiBuilder.group(
  Api,
  'reports',
  Effect.fn(function* (handlers) {
    const agenda = yield* Agenda
    return handlers.handle('weekly', ({ query }) => agendaHttp(agenda.report(query.date, query.page)))
  }),
)
