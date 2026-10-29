import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import type { CleaningError } from '../domain/cleaning.ts'
import { Cleaning } from '../services/Cleaning.ts'
import { badRequest, conflict, httpErrors, notFound } from './errors.ts'

const toHttp = httpErrors<CleaningError>({
  CleaningTaskNotFound: notFound('Tâche de ménage introuvable.'),
  CleaningItemNotFound: notFound('Point de checklist introuvable.'),
  CleaningTemplateNotFound: notFound('Fiche introuvable.'),
  CleaningTemplateNameTaken: conflict('Une fiche de ménage porte déjà ce nom.'),
  CleaningDayTaken: conflict('Un lot choisi a déjà une tâche de ménage prévue ce jour-là.'),
  CleaningAgentInvalid: badRequest('Choisissez un membre actif de l’équipe comme agent.'),
  CleaningIncomplete: conflict('Traitez chaque point de la checklist avant de terminer la tâche.'),
  CleaningLocked: conflict('La tâche est terminée ou annulée : rouvrez-la pour la modifier.'),
  CleaningAlreadyPlanned: conflict('La tâche est déjà prévue.'),
})

export const CleaningLive = HttpApiBuilder.group(
  Api,
  'cleaning',
  Effect.fn(function* (handlers) {
    const cleaning = yield* Cleaning
    return handlers
      .handle('options', () => toHttp(cleaning.options()))
      .handle('templates', () => toHttp(cleaning.templates()))
      .handle('createTemplate', ({ payload }) => toHttp(cleaning.createTemplate(payload)))
      .handle('updateTemplate', ({ params, payload }) => toHttp(cleaning.updateTemplate(params.id, payload)))
      .handle('removeTemplate', ({ params }) => toHttp(cleaning.removeTemplate(params.id)))
      .handle('tasks', ({ query }) => toHttp(cleaning.tasks(query)))
      .handle('lotTasks', ({ params, query }) => toHttp(cleaning.lotTasks(params.id, query.page)))
      .handle('create', ({ payload }) => toHttp(cleaning.create(payload)))
      .handle('task', ({ params }) => toHttp(cleaning.task(params.id)))
      .handle('update', ({ params, payload }) => toHttp(cleaning.update(params.id, payload)))
      .handle('reschedule', ({ payload }) => toHttp(cleaning.reschedule(payload)))
      .handle('order', ({ payload }) => toHttp(cleaning.order(payload)))
      .handle('status', ({ params, payload }) => toHttp(cleaning.setStatus(params.id, payload)))
      .handle('addItem', ({ params, payload }) => toHttp(cleaning.addItem(params.id, payload)))
      .handle('item', ({ params, payload }) => toHttp(cleaning.updateItem(params.id, payload)))
      .handle('removeItem', ({ params }) => toHttp(cleaning.removeItem(params.id)))
  }),
)
