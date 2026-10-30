import { Schema } from 'effect'
import type { InvalidInput } from './errors.ts'
import { CivilDate, ClientId, Instant, IntegerBetween, OptionalText, RequiredText } from './shared.ts'
import { Priority } from './priority.ts'
import { Role } from './accounts.ts'
import { Cleanliness } from './lots.ts'
import { addDays } from './rules.ts'
import { IssueStatus } from './technical.ts'

export const CleaningItemKind = Schema.Literals(['task', 'check'])
export type CleaningItemKind = typeof CleaningItemKind.Type
export const CleaningItemState = Schema.Literals(['todo', 'done', 'issue'])
export type CleaningItemState = typeof CleaningItemState.Type
export const CleaningStatus = Schema.Literals(['planned', 'done', 'cancelled'])
export type CleaningStatus = typeof CleaningStatus.Type
export const CleaningReview = Schema.Literals(['approved', 'revision'])
export type CleaningReview = typeof CleaningReview.Type
export const CleaningReviewFilter = Schema.Literals(['pending', 'approved', 'revision'])
export type CleaningReviewFilter = typeof CleaningReviewFilter.Type
export const CleaningCommentKind = Schema.Literals(['note', 'approved', 'revision'])
export type CleaningCommentKind = typeof CleaningCommentKind.Type
export const CleaningType = Schema.Literals(['departure', 'routine', 'deep', 'arrival', 'commons'])
export type CleaningType = typeof CleaningType.Type
export const CleaningPoint = Schema.Struct({ kind: CleaningItemKind, label: RequiredText('Intitulé du point', 160) })
export type CleaningPoint = typeof CleaningPoint.Type
const CleaningPoints = (message: string) => Schema.Array(CleaningPoint).check(Schema.isMaxLength(60, { message }))
export const CleaningTemplateInput = Schema.Struct({
  name: RequiredText('Nom de la fiche', 80),
  is_default: Schema.Boolean,
  default_type: Schema.optionalKey(Schema.NullOr(CleaningType)),
  items: CleaningPoints('Soixante points au maximum par fiche.'),
  lot_ids: Schema.Array(Schema.String),
})
export const CleaningTemplate = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  is_default: Schema.Boolean,
  default_type: Schema.NullOr(CleaningType),
  items: Schema.Array(Schema.Struct({ kind: CleaningItemKind, label: Schema.String })),
  lot_ids: Schema.Array(Schema.String),
})
export type CleaningTemplate = typeof CleaningTemplate.Type
export const templateFor = <T extends Pick<CleaningTemplate, 'is_default' | 'default_type' | 'lot_ids'>>(
  templates: readonly T[],
  type: CleaningType,
  lotId: string | null,
) =>
  templates.find((template) => template.default_type === type) ??
  (lotId ? templates.find((template) => template.lot_ids.includes(lotId)) : undefined) ??
  templates.find((template) => template.is_default)
export const CleaningOptions = Schema.Struct({
  lots: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      number: Schema.String,
      building_name: Schema.String,
      template_id: Schema.NullOr(Schema.String),
      cleanliness: Cleanliness,
      occupied: Schema.Boolean,
    }),
  ),
  places: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, building_name: Schema.String })),
  agents: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, role: Role })),
  templates: Schema.Array(CleaningTemplate),
})
export type CleaningOptions = typeof CleaningOptions.Type
const lotCountMessage = 'Choisissez entre 1 et 100 lots ou lieux.'
const weekdayMessage = 'Jour de la semaine invalide.'
export const CleaningRepeat = Schema.Struct({
  weekdays: Schema.Array(IntegerBetween(1, 7, weekdayMessage)).check(
    Schema.isMinLength(1, { message: 'Choisissez au moins un jour de répétition.' }),
    Schema.isMaxLength(7, { message: weekdayMessage }),
  ),
  until: CivilDate,
})
export const CleaningTaskCreate = Schema.Struct({
  priority: Schema.optionalKey(Priority),
  type: Schema.optionalKey(CleaningType),
  lot_ids: Schema.Array(Schema.String).check(Schema.isMaxLength(100, { message: lotCountMessage })),
  place_ids: Schema.optionalKey(
    Schema.Array(Schema.String).check(Schema.isMaxLength(100, { message: lotCountMessage })),
  ),
  repeat: Schema.optionalKey(CleaningRepeat),
  agent_id: Schema.String,
  day: CivilDate,
  template_id: Schema.String,
  note: OptionalText(1000),
  items: Schema.optionalKey(CleaningPoints('Soixante points au maximum par tâche.')),
})
const taskCountMessage = 'Choisissez entre 1 et 100 tâches.'
const TaskIds = Schema.Array(Schema.String).check(
  Schema.isMinLength(1, { message: taskCountMessage }),
  Schema.isMaxLength(100, { message: taskCountMessage }),
)
export const CleaningCreated = Schema.Struct({ created: Schema.Number, skipped: Schema.Array(Schema.String) })
export const CleaningBulk = Schema.Struct({
  task_ids: TaskIds,
  agent_id: Schema.optionalKey(Schema.String),
  day: Schema.optionalKey(CivilDate),
  priority: Schema.optionalKey(Priority),
  cancel: Schema.optionalKey(Schema.Boolean),
  items: Schema.optionalKey(CleaningPoints('Soixante points au maximum par ajout.')),
})
export const CleaningBulkResult = Schema.Struct({ updated: Schema.Number, skipped: Schema.Number })
export const CleaningChecklist = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      id: Schema.optionalKey(Schema.String),
      kind: CleaningItemKind,
      label: RequiredText('Intitulé du point', 160),
    }),
  ).check(Schema.isMaxLength(60, { message: 'Soixante points au maximum par tâche.' })),
})
export const CleaningCheckAll = Schema.Struct({ kind: CleaningItemKind, at: Schema.optionalKey(Instant) })
export const CleaningMovements = Schema.Struct({
  departures: Schema.Array(Schema.String),
  arrivals: Schema.Array(Schema.String),
})
export const CleaningOrder = Schema.Struct({ task_ids: TaskIds, day: CivilDate })
export const CleaningTaskInput = Schema.Struct({
  type: Schema.optionalKey(CleaningType),
  agent_id: Schema.String,
  day: CivilDate,
  note: OptionalText(1000),
  priority: Schema.optionalKey(Priority),
})
export const CleaningStatusInput = Schema.Struct({
  status: CleaningStatus,
  report: OptionalText(1000),
  at: Schema.optionalKey(Instant),
})
export const CleaningTask = Schema.Struct({
  priority: Priority,
  id: Schema.String,
  type: CleaningType,
  lot_id: Schema.NullOr(Schema.String),
  lot_number: Schema.String,
  place_id: Schema.NullOr(Schema.String),
  place_name: Schema.String,
  building_name: Schema.String,
  cleanliness: Schema.NullOr(Cleanliness),
  arrival: Schema.Boolean,
  agent_id: Schema.String,
  agent_name: Schema.String,
  day: Schema.String,
  status: CleaningStatus,
  template_name: Schema.String,
  note: Schema.String,
  report: Schema.String,
  completed_at: Schema.NullOr(Schema.String),
  completed_by: Schema.NullOr(Schema.String),
  position: Schema.NullOr(Schema.Number),
  review: Schema.NullOr(CleaningReview),
  reviewed_at: Schema.NullOr(Schema.String),
  reviewed_by: Schema.NullOr(Schema.String),
  comments: Schema.Number,
  total: Schema.Number,
  handled: Schema.Number,
  issues: Schema.Number,
  remarks: Schema.Array(Schema.String),
})
export type CleaningTask = typeof CleaningTask.Type
export const CleaningTaskPage = Schema.Struct({ items: Schema.Array(CleaningTask), total: Schema.Number })
export const CleaningItemInput = Schema.Struct({
  state: CleaningItemState,
  note: OptionalText(500),
  at: Schema.optionalKey(Instant),
})
export const CleaningItem = Schema.Struct({
  id: Schema.String,
  kind: CleaningItemKind,
  label: Schema.String,
  state: CleaningItemState,
  note: Schema.String,
  updated_by: Schema.NullOr(Schema.String),
  updated_at: Schema.NullOr(Schema.String),
  issue_id: Schema.NullOr(Schema.String),
  issue_status: Schema.NullOr(IssueStatus),
})
export type CleaningItem = typeof CleaningItem.Type
export const CleaningCommentInput = Schema.Struct({
  body: RequiredText('Commentaire', 1000),
  id: Schema.optionalKey(ClientId),
  at: Schema.optionalKey(Instant),
})
export const CleaningReviewInput = Schema.Struct({
  decision: CleaningReview,
  comment: OptionalText(1000),
  day: Schema.optionalKey(CivilDate),
  item_ids: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(60))),
})
export const CleaningComment = Schema.Struct({
  id: Schema.String,
  kind: CleaningCommentKind,
  body: Schema.String,
  author: Schema.String,
  created_at: Schema.String,
})
export type CleaningComment = typeof CleaningComment.Type
export const CleaningSupply = Schema.Struct({
  id: Schema.String,
  item_id: Schema.String,
  item_name: Schema.String,
  unit: Schema.String,
  quantity: Schema.Number,
  occurred_on: Schema.String,
  comment: Schema.String,
  actor: Schema.String,
})
export type CleaningSupply = typeof CleaningSupply.Type
export const CleaningTaskDetail = Schema.Struct({
  task: CleaningTask,
  items: Schema.Array(CleaningItem),
  comments: Schema.Array(CleaningComment),
  supplies: Schema.Array(CleaningSupply),
})
export type CleaningTaskDetail = typeof CleaningTaskDetail.Type
export const CleaningDay = Schema.Struct({ day: Schema.String, tasks: Schema.Array(CleaningTaskDetail) })
export type CleaningDay = typeof CleaningDay.Type
export const CleanlinessInput = Schema.Struct({ cleanliness: Cleanliness })
const ReadinessTask = Schema.NullOr(
  Schema.Struct({
    id: Schema.String,
    day: Schema.String,
    status: CleaningStatus,
    review: Schema.NullOr(CleaningReview),
    agent_name: Schema.String,
  }),
)
export const ReadinessLot = Schema.Struct({
  lot_id: Schema.String,
  number: Schema.String,
  building_name: Schema.String,
  cleanliness: Cleanliness,
  cleanliness_at: Schema.NullOr(Schema.String),
  arrival: Schema.NullOr(Schema.String),
  task: ReadinessTask,
})
export type ReadinessLot = typeof ReadinessLot.Type
export const CleaningReadiness = Schema.Struct({
  day: Schema.String,
  arrivals: Schema.Array(ReadinessLot),
  to_prepare: Schema.Array(ReadinessLot),
  counts: Schema.Struct({
    dirty: Schema.Number,
    clean: Schema.Number,
    inspected: Schema.Number,
    out_of_service: Schema.Number,
  }),
})
export type CleaningReadiness = typeof CleaningReadiness.Type
export const isReady = (lot: Pick<ReadinessLot, 'cleanliness'>) =>
  lot.cleanliness === 'clean' || lot.cleanliness === 'inspected'

export class CleaningTaskNotFound extends Schema.TaggedError<CleaningTaskNotFound>()('CleaningTaskNotFound', {}) {}
export class CleaningItemNotFound extends Schema.TaggedError<CleaningItemNotFound>()('CleaningItemNotFound', {}) {}
export class CleaningTemplateNotFound extends Schema.TaggedError<CleaningTemplateNotFound>()(
  'CleaningTemplateNotFound',
  {},
) {}
export class CleaningTemplateNameTaken extends Schema.TaggedError<CleaningTemplateNameTaken>()(
  'CleaningTemplateNameTaken',
  {},
) {}
export class CleaningDayTaken extends Schema.TaggedError<CleaningDayTaken>()('CleaningDayTaken', {}) {}
export class CleaningAgentInvalid extends Schema.TaggedError<CleaningAgentInvalid>()('CleaningAgentInvalid', {}) {}
export class CleaningIncomplete extends Schema.TaggedError<CleaningIncomplete>()('CleaningIncomplete', {}) {}
export class CleaningLocked extends Schema.TaggedError<CleaningLocked>()('CleaningLocked', {}) {}
export class CleaningAlreadyPlanned extends Schema.TaggedError<CleaningAlreadyPlanned>()(
  'CleaningAlreadyPlanned',
  {},
) {}
export class CleaningCancelled extends Schema.TaggedError<CleaningCancelled>()('CleaningCancelled', {}) {}
export class CleaningNotDone extends Schema.TaggedError<CleaningNotDone>()('CleaningNotDone', {}) {}
export class CleaningAlreadyApproved extends Schema.TaggedError<CleaningAlreadyApproved>()(
  'CleaningAlreadyApproved',
  {},
) {}

export type CleaningError =
  | CleaningTaskNotFound
  | CleaningItemNotFound
  | CleaningTemplateNotFound
  | CleaningTemplateNameTaken
  | CleaningDayTaken
  | CleaningAgentInvalid
  | CleaningIncomplete
  | CleaningLocked
  | CleaningAlreadyPlanned
  | CleaningCancelled
  | CleaningNotDone
  | CleaningAlreadyApproved
  | InvalidInput

export const MAX_PERIOD_DAYS = 41
export const MAX_CREATED = 200
export const MAX_REPEAT_DAYS = 91
export const READINESS_LIMIT = 100
export const PAGE_SIZE = 20
export const REVIEW_LIMIT = 50

export const isoWeekday = (day: string) => ((new Date(day).getUTCDay() + 6) % 7) + 1
export const repeatDays = (day: string, repeat?: { readonly weekdays: readonly number[]; readonly until: string }) => {
  if (!repeat) return [day]
  const days: string[] = []
  for (let current = day; current <= repeat.until; current = addDays(current, 1))
    if (repeat.weekdays.includes(isoWeekday(current))) days.push(current)
  return days
}
