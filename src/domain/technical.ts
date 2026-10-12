import { Schema } from 'effect'
import type { InvalidInput } from './errors.ts'
import { CivilDate, IntegerBetween, LocalDateTime, OptionalText, PageNumber, RequiredText } from './shared.ts'

export const PAGE_SIZE = 20
export const MAX_LOCATIONS = 50
export const MAX_SUPPLIERS = 20

export const LocationRef = Schema.String.check(Schema.isPattern(/^(lot|place):[^:]+$/, { message: 'Lieu invalide.' }))
const OptionalLocationRef = Schema.String.check(
  Schema.isPattern(/^((lot|place):[^:]+)?$/, { message: 'Lieu invalide.' }),
)
export const parseLocation = (ref: string) => {
  const [kind, id = ''] = ref.split(':')
  return { kind: kind as 'lot' | 'place', id }
}
export const Location = Schema.Struct({ ref: Schema.String, label: Schema.String, archived: Schema.Boolean })
export type Location = typeof Location.Type

export const TechnicalOptions = Schema.Struct({
  locations: Schema.Array(Schema.Struct({ ref: Schema.String, label: Schema.String, group: Schema.String })),
  suppliers: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, trades: Schema.String })),
})
export type TechnicalOptions = typeof TechnicalOptions.Type

export const PlaceInput = Schema.Struct({
  name: RequiredText('Nom du lieu', 80),
  building_id: Schema.String,
  description: OptionalText(500),
  archived: Schema.Boolean,
})
export const Place = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  building_id: Schema.NullOr(Schema.String),
  building_name: Schema.String,
  description: Schema.String,
  archived: Schema.Boolean,
  active_works: Schema.Number,
  open_issues: Schema.Number,
})
export type Place = typeof Place.Type

export const ArchiveFilter = Schema.Literals(['no', 'yes']).annotate({ message: 'Filtre invalide.' })
export const SupplierInput = Schema.Struct({
  name: RequiredText('Nom du fournisseur', 120),
  trades: OptionalText(200),
  contact: OptionalText(120),
  phone: OptionalText(40),
  email: OptionalText(254),
  notes: OptionalText(2000),
  archived: Schema.Boolean,
})
export const Supplier = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  trades: Schema.String,
  contact: Schema.String,
  phone: Schema.String,
  email: Schema.String,
  notes: Schema.String,
  archived: Schema.Boolean,
  active_works: Schema.Number,
})
export type Supplier = typeof Supplier.Type
export const SupplierQuery = {
  q: Schema.optionalKey(Schema.String),
  archived: Schema.optionalKey(ArchiveFilter),
  page: Schema.optionalKey(PageNumber(100000)),
}
export const SupplierPage = Schema.Struct({ items: Schema.Array(Supplier), total: Schema.Number })

export const IssueStatus = Schema.Literals(['open', 'resolved', 'dismissed'])
export type IssueStatus = typeof IssueStatus.Type
export const IssueInput = Schema.Struct({
  title: RequiredText('Titre du signalement'),
  description: OptionalText(2000),
  reported_on: CivilDate,
  location: OptionalLocationRef,
  status: IssueStatus,
})
export const Issue = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  reported_on: Schema.String,
  location: Schema.NullOr(Location),
  status: IssueStatus,
  work_id: Schema.NullOr(Schema.String),
  work_title: Schema.NullOr(Schema.String),
  actor: Schema.String,
})
export type Issue = typeof Issue.Type
export const IssueQuery = {
  q: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(
    Schema.Literals(['all', ...IssueStatus.literals]).annotate({ message: 'Filtre invalide.' }),
  ),
  page: Schema.optionalKey(PageNumber(100000)),
}
export const IssuePage = Schema.Struct({ items: Schema.Array(Issue), total: Schema.Number, open: Schema.Number })

export const WorkState = Schema.Literals(['open', 'in_progress', 'done', 'cancelled'])
export type WorkState = typeof WorkState.Type
export const WorkStatus = Schema.Literals(['to_plan', 'planned', 'in_progress', 'done', 'cancelled'])
export type WorkStatus = typeof WorkStatus.Type
export const WorkInput = Schema.Struct({
  title: RequiredText('Titre des travaux'),
  description: OptionalText(4000),
  locations: Schema.Array(LocationRef).check(
    Schema.isMinLength(1, { message: 'Choisissez au moins un lieu.' }),
    Schema.isMaxLength(MAX_LOCATIONS, { message: `${MAX_LOCATIONS} lieux au maximum.` }),
  ),
  supplier_ids: Schema.Array(Schema.String).check(
    Schema.isMaxLength(MAX_SUPPLIERS, { message: `${MAX_SUPPLIERS} fournisseurs au maximum.` }),
  ),
  planned_start: Schema.NullOr(CivilDate),
  planned_end: Schema.NullOr(CivilDate),
})
export const WorkCreate = Schema.Struct({ ...WorkInput.fields, issue_id: Schema.optionalKey(Schema.String) })
export const WorkActionKind = Schema.Literals(['start', 'finish', 'cancel', 'reopen'])
export type WorkActionKind = typeof WorkActionKind.Type
export const WorkAction = Schema.Struct({
  action: WorkActionKind,
  date: Schema.NullOr(CivilDate),
  comment: OptionalText(2000),
})
const workDates = {
  planned_start: Schema.NullOr(Schema.String),
  planned_end: Schema.NullOr(Schema.String),
  actual_start: Schema.NullOr(Schema.String),
  actual_end: Schema.NullOr(Schema.String),
}
export const WorkSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: WorkStatus,
  ...workDates,
  locations: Schema.Array(Schema.String),
  suppliers: Schema.Array(Schema.String),
  next_intervention: Schema.NullOr(Schema.String),
})
export type WorkSummary = typeof WorkSummary.Type
export const WorkFilter = Schema.Literals(['active', 'all', ...WorkStatus.literals]).annotate({
  message: 'Filtre invalide.',
})
export type WorkFilter = typeof WorkFilter.Type
export const WorkQuery = {
  q: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(WorkFilter),
  location: Schema.optionalKey(OptionalLocationRef),
  supplier: Schema.optionalKey(Schema.String),
  page: Schema.optionalKey(PageNumber(100000)),
}
export const WorkPage = Schema.Struct({ items: Schema.Array(WorkSummary), total: Schema.Number, active: Schema.Number })
export const NoteKind = Schema.Literals(['note', 'problem', 'status'])
export const NoteInput = Schema.Struct({
  kind: Schema.Literals(['note', 'problem']),
  body: RequiredText('Note', 2000),
})
export const WorkNote = Schema.Struct({
  id: Schema.String,
  kind: NoteKind,
  body: Schema.String,
  actor: Schema.String,
  created_at: Schema.String,
})
export type WorkNote = typeof WorkNote.Type
export const InterventionStatus = Schema.Literals(['planned', 'done', 'cancelled'])
export const InterventionInput = Schema.Struct({
  local_start: LocalDateTime,
  duration: IntegerBetween(5, 720, 'Durée : entre 5 et 720 minutes.'),
  supplier_id: Schema.String,
  status: InterventionStatus,
  report: OptionalText(4000),
})
export const Intervention = Schema.Struct({
  id: Schema.String,
  work_id: Schema.String,
  supplier_id: Schema.NullOr(Schema.String),
  supplier: Schema.NullOr(Schema.String),
  starts_at: Schema.String,
  duration: Schema.Number,
  status: InterventionStatus,
  report: Schema.String,
})
export type Intervention = typeof Intervention.Type
export const WorkDetail = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  status: WorkStatus,
  ...workDates,
  locations: Schema.Array(Location),
  suppliers: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      trades: Schema.String,
      phone: Schema.String,
      email: Schema.String,
      archived: Schema.Boolean,
    }),
  ),
  notes: Schema.Array(WorkNote),
  interventions: Schema.Array(Intervention),
  issues: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, status: IssueStatus })),
})
export type WorkDetail = typeof WorkDetail.Type

export class PlaceNotFound extends Schema.TaggedError<PlaceNotFound>()('PlaceNotFound', {}) {}
export class PlaceNameTaken extends Schema.TaggedError<PlaceNameTaken>()('PlaceNameTaken', {}) {}
export class SupplierNotFound extends Schema.TaggedError<SupplierNotFound>()('SupplierNotFound', {}) {}
export class SupplierNameTaken extends Schema.TaggedError<SupplierNameTaken>()('SupplierNameTaken', {}) {}
export class SupplierUnavailable extends Schema.TaggedError<SupplierUnavailable>()('SupplierUnavailable', {}) {}
export class IssueNotFound extends Schema.TaggedError<IssueNotFound>()('IssueNotFound', {}) {}
export class IssueLinked extends Schema.TaggedError<IssueLinked>()('IssueLinked', {}) {}
export class WorkNotFound extends Schema.TaggedError<WorkNotFound>()('WorkNotFound', {}) {}
export class InterventionNotFound extends Schema.TaggedError<InterventionNotFound>()('InterventionNotFound', {}) {}
export class LocationUnavailable extends Schema.TaggedError<LocationUnavailable>()('LocationUnavailable', {}) {}
export class BuildingUnavailable extends Schema.TaggedError<BuildingUnavailable>()('BuildingUnavailable', {}) {}

export type TechnicalError =
  | PlaceNotFound
  | PlaceNameTaken
  | SupplierNotFound
  | SupplierNameTaken
  | SupplierUnavailable
  | IssueNotFound
  | IssueLinked
  | WorkNotFound
  | InterventionNotFound
  | LocationUnavailable
  | BuildingUnavailable
  | InvalidInput

export const workStatus = (state: WorkState, plannedStart: string | null): WorkStatus =>
  state === 'open' ? (plannedStart ? 'planned' : 'to_plan') : state

export const workStatusLabels: Record<WorkStatus, string> = {
  to_plan: 'À planifier',
  planned: 'Planifié',
  in_progress: 'En cours',
  done: 'Terminé',
  cancelled: 'Annulé',
}

export const actionNotes: Record<WorkActionKind, string> = {
  start: 'Chantier démarré',
  finish: 'Chantier terminé',
  cancel: 'Chantier annulé',
  reopen: 'Chantier rouvert',
}

export const workTransition = (
  work: { state: WorkState; actual_start: string | null },
  action: WorkActionKind,
  date: string | null,
  today: string,
): { state: WorkState; actual_start: string | null; actual_end: string | null } | string => {
  const closed = work.state === 'done' || work.state === 'cancelled'
  if (action === 'reopen')
    return closed
      ? { state: work.actual_start ? 'in_progress' : 'open', actual_start: work.actual_start, actual_end: null }
      : 'Seul un chantier terminé ou annulé peut être rouvert.'
  if (closed) return 'Ce chantier est déjà clos. Rouvrez-le avant de le modifier.'
  if (action === 'cancel') return { state: 'cancelled', actual_start: work.actual_start, actual_end: null }
  if (!date) return action === 'start' ? 'Indiquez la date réelle de début.' : 'Indiquez la date réelle de fin.'
  if (date > today) return 'La date réelle ne peut pas être dans le futur.'
  if (action === 'start')
    return work.state === 'open'
      ? { state: 'in_progress', actual_start: date, actual_end: null }
      : 'Ce chantier est déjà en cours.'
  const start = work.actual_start ?? date
  if (date < start) return 'La fin ne peut pas précéder le début réel du chantier.'
  return { state: 'done', actual_start: start, actual_end: date }
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
