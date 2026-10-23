import { Context, Effect, Layer, Predicate, Schema } from 'effect'
import { currentDay } from '../domain/clock.ts'
import { CurrentUser } from '../domain/CurrentUser.ts'
import { CleaningStatusInput } from '../domain/cleaning.ts'
import { LotStateFilter } from '../domain/lots.ts'
import { ReadingInput } from '../domain/meters.ts'
import { CivilDate, CivilMonth } from '../domain/shared.ts'
import { MovementInput } from '../domain/stock.ts'
import {
  AiTooManySteps,
  MAX_STUDIO_STEPS,
  MAX_TOOL_RESULT,
  type StudioMessage,
  type StudioProposal,
  type StudioStep,
} from '../domain/studio.ts'
import { Agenda } from './Agenda.ts'
import { AiProvider, type AiToolResult, type AiToolSpec, type AiTurn } from './AiProvider.ts'
import { Cleaning } from './Cleaning.ts'
import { Lots } from './Lots.ts'
import { Meters } from './Meters.ts'
import { Stock } from './Stock.ts'
import { Voice } from './Voice.ts'

type Run = Effect.Effect<unknown, unknown, CurrentUser>
type Tool = AiToolSpec & { label: string; run: (input: unknown, propose: (proposal: StudioProposal) => void) => Run }

const tool = <S extends Schema.Codec<unknown, unknown>>(
  name: string,
  label: string,
  description: string,
  parameters: S,
  run: (input: S['Type'], propose: (proposal: StudioProposal) => void) => Run,
): Tool => ({
  name,
  label,
  description,
  parameters: Schema.toJsonSchemaDocument(parameters).schema as Record<string, unknown>,
  run: (input, propose) =>
    Effect.flatMap(Schema.decodeUnknownEffect(parameters)(input), (decoded) => run(decoded, propose)),
})

const describe = (description: string) => ({ description })
const awaiting = 'Proposition affichée à l’utilisateur : elle ne sera appliquée qu’après sa confirmation.'

const failure = (error: unknown) =>
  Schema.isSchemaError(error)
    ? 'Paramètres invalides : ' + error.message
    : Predicate.isTagged(error, 'InvalidInput') && Predicate.hasProperty(error, 'message')
      ? String(error.message)
      : Predicate.hasProperty(error, '_tag') && !Predicate.isTagged(error, 'SqlError')
        ? 'Refusé : ' + String(error['_tag'])
        : 'Erreur technique pendant la lecture des données.'

const roles = { admin: 'administrateur', manager: 'gestionnaire', cleaner: 'agent de ménage' } as const

const make = Effect.gen(function* () {
  const ai = yield* AiProvider
  const lots = yield* Lots
  const agenda = yield* Agenda
  const stock = yield* Stock
  const meters = yield* Meters
  const cleaning = yield* Cleaning
  const voice = yield* Voice

  const tools: Tool[] = [
    tool(
      'rechercher_lots',
      'Recherche des lots',
      'Liste les lots de la résidence avec leur occupation. Pagination de 50 lots.',
      Schema.Struct({
        q: Schema.optionalKey(Schema.String.annotate(describe('Numéro, occupant ou bâtiment recherché'))),
        state: Schema.optionalKey(LotStateFilter.annotate(describe('Filtre d’occupation'))),
        page: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
      }),
      (input) => lots.list(input),
    ),
    tool(
      'detail_lot',
      'Lecture d’un lot',
      'Détail d’un lot : séjours, préavis, états des lieux et historique.',
      Schema.Struct({ id: Schema.String.annotate(describe('Identifiant du lot')) }),
      ({ id }) => lots.detail(id),
    ),
    tool(
      'calendrier',
      'Lecture du calendrier',
      'Événements (entrées, sorties, états des lieux, interventions) entre deux dates incluses, 63 jours maximum.',
      Schema.Struct({
        from: CivilDate.annotate(describe('AAAA-MM-JJ')),
        to: CivilDate.annotate(describe('AAAA-MM-JJ')),
      }),
      ({ from, to }) => agenda.calendar(from, to),
    ),
    tool(
      'bilan_hebdomadaire',
      'Lecture du bilan',
      'Bilan de la semaine civile (lundi au dimanche) contenant la date donnée.',
      Schema.Struct({ date: CivilDate.annotate(describe('AAAA-MM-JJ')) }),
      ({ date }) => Effect.map(agenda.report(date), ({ from, to, rows }) => ({ from, to, rows })),
    ),
    tool(
      'stocks',
      'Lecture des stocks',
      'Articles en stock avec quantité, seuil et niveau. alert=true limite aux articles sous le seuil.',
      Schema.Struct({
        q: Schema.optionalKey(Schema.String.annotate(describe('Nom d’article recherché'))),
        alert: Schema.optionalKey(Schema.Boolean),
        page: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
      }),
      ({ q, alert, page }) => stock.list({ q, level: alert ? 'alert' : 'all', page }),
    ),
    tool(
      'compteurs',
      'Lecture des compteurs',
      'Compteurs des communs avec dernier relevé. pending=true limite aux compteurs sans relevé sur le mois.',
      Schema.Struct({ month: CivilMonth.annotate(describe('AAAA-MM')), pending: Schema.optionalKey(Schema.Boolean) }),
      ({ month, pending }) => meters.list(month, 1, pending ?? false),
    ),
    tool(
      'menage',
      'Lecture du ménage',
      'Tâches de ménage planifiées entre deux dates incluses, six semaines maximum.',
      Schema.Struct({
        from: CivilDate.annotate(describe('AAAA-MM-JJ')),
        to: CivilDate.annotate(describe('AAAA-MM-JJ')),
      }),
      (input) => cleaning.tasks(input),
    ),
    tool(
      'proposer_mouvement_stock',
      'Proposition de mouvement de stock',
      'Propose une entrée, une sortie ou un inventaire sur un article. L’utilisateur confirme avant application.',
      Schema.Struct({ itemId: Schema.String, movement: MovementInput }),
      ({ itemId, movement }, propose) =>
        Effect.map(stock.item(itemId), (item) => {
          const verb = { in: 'Entrée de', out: 'Sortie de', count: 'Inventaire à' }[movement.kind]
          propose({
            kind: 'stock_movement',
            itemId,
            movement,
            summary: `${verb} ${movement.quantity} ${item.unit} · ${item.name} · ${movement.occurred_on}`,
          })
          return awaiting
        }),
    ),
    tool(
      'proposer_releve_compteur',
      'Proposition de relevé',
      'Propose un relevé de compteur. L’utilisateur confirme avant application.',
      Schema.Struct({ meterId: Schema.String, reading: ReadingInput }),
      ({ meterId, reading }, propose) =>
        Effect.map(meters.detail(meterId), (meter) => {
          propose({
            kind: 'meter_reading',
            meterId,
            reading,
            summary: `Relevé ${meter.name} : ${reading.value} ${meter.unit} au ${reading.observed_on}`,
          })
          return awaiting
        }),
    ),
    tool(
      'proposer_statut_menage',
      'Proposition de statut de ménage',
      'Propose de marquer une tâche de ménage comme réalisée, annulée ou replanifiée. L’utilisateur confirme.',
      Schema.Struct({ taskId: Schema.String, status: CleaningStatusInput }),
      ({ taskId, status }, propose) =>
        Effect.map(cleaning.task(taskId), ({ task }) => {
          const label = { done: 'Réalisé', cancelled: 'Annulé', planned: 'Replanifié' }[status.status]
          propose({
            kind: 'cleaning_status',
            taskId,
            status,
            summary: `${label} · ménage lot ${task.lot_number} du ${task.day}`,
          })
          return awaiting
        }),
    ),
  ]
  const byName = new Map(tools.map((entry) => [entry.name, entry]))
  const specs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }))

  const status = Effect.succeed({
    available: ai.available,
    provider: ai.name,
    model: ai.model,
    voice: ai.available && voice.available,
  })

  const ask = Effect.fn('Studio.ask')(function* (messages: readonly StudioMessage[], route?: string) {
    const me = yield* CurrentUser
    const today = yield* currentDay
    const system = [
      'Tu es l’assistant opérationnel de GResidence, outil de gestion d’une résidence étudiante.',
      `Résidence : ${me.residenceName}. Utilisateur : ${me.name}, ${roles[me.role]}. Date du jour (Europe/Paris) : ${today}.`,
      route ? `Page ouverte : #${route}.` : '',
      'Réponds en français, de façon brève et factuelle. Appuie chaque affirmation sur les outils de lecture ; n’invente aucune donnée.',
      'Tu ne modifies jamais rien toi-même : pour agir, utilise un outil proposer_* puis indique que la proposition attend une confirmation.',
      'Si un outil est refusé, explique que le rôle de l’utilisateur ne permet pas cette consultation.',
    ]
      .filter(Boolean)
      .join('\n')
    const turns: AiTurn[] = messages.map((message) =>
      message.role === 'user'
        ? { role: 'user', text: message.content }
        : { role: 'assistant', text: message.content, calls: [] },
    )
    const steps: StudioStep[] = []
    const proposals: StudioProposal[] = []
    const propose = (proposal: StudioProposal) => void proposals.push(proposal)
    for (let round = 0; round < MAX_STUDIO_STEPS; round++) {
      const completion = yield* ai.complete({ system, turns, tools: specs })
      turns.push({ role: 'assistant', text: completion.text, calls: completion.calls, raw: completion.raw })
      if (completion.calls.length === 0) return { text: completion.text, steps, proposals }
      const results = yield* Effect.forEach(
        completion.calls,
        (call) => {
          const found = byName.get(call.name)
          const run = found ? found.run(call.input, propose) : Effect.fail(new Error('Outil inconnu.'))
          return run.pipe(
            Effect.map((value): AiToolResult => {
              const content = typeof value === 'string' ? value : JSON.stringify(value)
              return { id: call.id, content: content.slice(0, MAX_TOOL_RESULT), isError: false }
            }),
            Effect.catch((error) => Effect.succeed({ id: call.id, content: failure(error), isError: true })),
          )
        },
        { concurrency: 4 },
      )
      completion.calls.forEach((call, index) =>
        steps.push({ tool: call.name, label: byName.get(call.name)?.label ?? call.name, ok: !results[index]!.isError }),
      )
      turns.push({ role: 'tool', results })
    }
    return yield* new AiTooManySteps()
  })

  return { status, ask }
})

export class Studio extends Context.Service<Studio, Effect.Success<typeof make>>()('gresidence/Studio') {
  static readonly layer = Layer.effect(Studio, make)
}
