import { Schema } from 'effect'
import { CivilDate, OptionalText, PageNumber, RequiredText } from './shared.ts'
import { LocationRef } from './technical.ts'
import { addDays, monthLast, shiftMonth } from './rules.ts'

export const VisitFrequency = Schema.Literals(['weekly', 'monthly', 'quarterly', 'once'])
export type VisitFrequency = typeof VisitFrequency.Type
export const frequencyLabels: Record<VisitFrequency, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  once: 'Ponctuelle',
}
export const nextVisitDate = (date: string, frequency: VisitFrequency): string | null => {
  if (frequency === 'once') return null
  if (frequency === 'weekly') return addDays(date, 7)
  const month = shiftMonth(date, frequency === 'monthly' ? 1 : 3).slice(0, 7)
  return (
    month + '-' + String(Math.min(Number(date.slice(8)), Number(monthLast(month + '-01').slice(8)))).padStart(2, '0')
  )
}
export const VisitPointInput = Schema.Struct({
  zone: RequiredText('Zone', 80),
  label: RequiredText('Point à vérifier', 160),
  location: Schema.NullOr(LocationRef),
})
export const VisitTemplateInput = Schema.Struct({
  name: RequiredText('Nom du modèle', 100),
  building_id: Schema.String,
  frequency: VisitFrequency,
  first_due: Schema.NullOr(CivilDate),
  archived: Schema.Boolean,
  points: Schema.Array(VisitPointInput).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
})
export const VisitTemplateSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  building_id: Schema.String,
  building: Schema.String,
  frequency: VisitFrequency,
  first_due: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  last_completed: Schema.NullOr(Schema.String),
  next_due: Schema.NullOr(Schema.String),
  planned_id: Schema.NullOr(Schema.String),
  planned_on: Schema.NullOr(Schema.String),
  point_count: Schema.Number,
})
export type VisitTemplateSummary = typeof VisitTemplateSummary.Type
export const VisitTemplate = Schema.Struct({ ...VisitTemplateSummary.fields, points: Schema.Array(VisitPointInput) })
export type VisitTemplate = typeof VisitTemplate.Type
export const VisitState = Schema.Literals(['planned', 'done', 'cancelled'])
export const VisitPointState = Schema.Literals(['pending', 'ok', 'issue', 'not_verified'])
export type VisitPointState = typeof VisitPointState.Type
export const pointStateLabels: Record<VisitPointState, string> = {
  pending: 'À vérifier',
  ok: 'Conforme',
  issue: 'Anomalie',
  not_verified: 'Non vérifié',
}
export const VisitDirectCreate = Schema.Struct({
  name: RequiredText('Titre de la visite', 100),
  building_id: Schema.String,
  frequency: VisitFrequency,
  scheduled_on: CivilDate,
  points: Schema.Array(VisitPointInput).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
})
export const VisitCreate = Schema.Struct({ template_id: Schema.String, scheduled_on: CivilDate })
export const VisitPlan = Schema.Struct({ scheduled_on: CivilDate })
export const VisitPointUpdate = Schema.Struct({ state: VisitPointState, note: OptionalText(2000) })
export const VisitAction = Schema.Struct({
  action: Schema.Literals(['finish', 'cancel']),
  completed_on: Schema.NullOr(CivilDate),
  report: OptionalText(4000),
})
export const VisitSummary = Schema.Struct({
  id: Schema.String,
  template_id: Schema.String,
  name: Schema.String,
  building_id: Schema.String,
  building: Schema.String,
  frequency: VisitFrequency,
  scheduled_on: Schema.String,
  status: VisitState,
  completed_on: Schema.NullOr(Schema.String),
  actor: Schema.String,
  report: Schema.String,
  total: Schema.Number,
  handled: Schema.Number,
  anomalies: Schema.Number,
})
export type VisitSummary = typeof VisitSummary.Type
export const VisitPoint = Schema.Struct({
  id: Schema.String,
  zone: Schema.String,
  label: Schema.String,
  location: Schema.NullOr(Schema.String),
  state: VisitPointState,
  note: Schema.String,
  issue_id: Schema.NullOr(Schema.String),
  actor: Schema.String,
  checked_at: Schema.NullOr(Schema.String),
})
export type VisitPoint = typeof VisitPoint.Type
export const VisitDetail = Schema.Struct({ ...VisitSummary.fields, points: Schema.Array(VisitPoint) })
export type VisitDetail = typeof VisitDetail.Type
export const VisitQuery = {
  building: Schema.optionalKey(Schema.String),
  q: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.Literals(['all', ...VisitState.literals])),
  page: Schema.optionalKey(PageNumber(100000)),
}
export const TemplateQuery = {
  building: Schema.optionalKey(Schema.String),
  archived: Schema.optionalKey(Schema.Literals(['yes', 'no'])),
  page: Schema.optionalKey(PageNumber(100000)),
}
export const VisitPage = Schema.Struct({ items: Schema.Array(VisitSummary), total: Schema.Number })
export const VisitTemplatePage = Schema.Struct({ items: Schema.Array(VisitTemplateSummary), total: Schema.Number })
export class VisitNotFound extends Schema.TaggedError<VisitNotFound>()('VisitNotFound', {}) {}
export class VisitConflict extends Schema.TaggedError<VisitConflict>()('VisitConflict', {}) {}
export class VisitTemplateNameTaken extends Schema.TaggedError<VisitTemplateNameTaken>()(
  'VisitTemplateNameTaken',
  {},
) {}
export class VisitAlreadyPlanned extends Schema.TaggedError<VisitAlreadyPlanned>()('VisitAlreadyPlanned', {}) {}
