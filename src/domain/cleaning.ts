import { Schema } from 'effect'
import type { InvalidInput } from './errors.ts'
import { CivilDate, OptionalText, RequiredText } from './shared.ts'
import { Role } from './accounts.ts'

export const CleaningItemKind = Schema.Literals(['task', 'check'])
export type CleaningItemKind = typeof CleaningItemKind.Type
export const CleaningItemState = Schema.Literals(['todo', 'done', 'issue'])
export type CleaningItemState = typeof CleaningItemState.Type
export const CleaningStatus = Schema.Literals(['planned', 'done', 'cancelled'])
export type CleaningStatus = typeof CleaningStatus.Type
export const CleaningPoint = Schema.Struct({ kind: CleaningItemKind, label: RequiredText('Point de la fiche', 160) })
export type CleaningPoint = typeof CleaningPoint.Type
export const CleaningTemplateInput = Schema.Struct({
  name: RequiredText('Nom de la fiche', 80),
  is_default: Schema.Boolean,
  items: Schema.Array(CleaningPoint).check(
    Schema.isMaxLength(60, { message: 'Soixante points au maximum par fiche.' }),
  ),
  lot_ids: Schema.Array(Schema.String),
})
export const CleaningTemplate = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  is_default: Schema.Boolean,
  items: Schema.Array(Schema.Struct({ kind: CleaningItemKind, label: Schema.String })),
  lot_ids: Schema.Array(Schema.String),
})
export type CleaningTemplate = typeof CleaningTemplate.Type
export const CleaningOptions = Schema.Struct({
  lots: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      number: Schema.String,
      building_name: Schema.String,
      template_id: Schema.NullOr(Schema.String),
    }),
  ),
  agents: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, role: Role })),
  templates: Schema.Array(CleaningTemplate),
})
export type CleaningOptions = typeof CleaningOptions.Type
const lotCountMessage = 'Choisissez entre 1 et 100 lots.'
export const CleaningTaskCreate = Schema.Struct({
  lot_ids: Schema.Array(Schema.String).check(
    Schema.isMinLength(1, { message: lotCountMessage }),
    Schema.isMaxLength(100, { message: lotCountMessage }),
  ),
  agent_id: Schema.String,
  day: CivilDate,
  template_id: Schema.String,
  note: OptionalText(1000),
})
const taskCountMessage = 'Choisissez entre 1 et 100 tâches.'
export const CleaningReschedule = Schema.Struct({
  task_ids: Schema.Array(Schema.String).check(
    Schema.isMinLength(1, { message: taskCountMessage }),
    Schema.isMaxLength(100, { message: taskCountMessage }),
  ),
  day: CivilDate,
})
export const CleaningTaskInput = Schema.Struct({ agent_id: Schema.String, day: CivilDate, note: OptionalText(1000) })
export const CleaningStatusInput = Schema.Struct({ status: CleaningStatus, report: OptionalText(1000) })
export const CleaningTask = Schema.Struct({
  id: Schema.String,
  lot_id: Schema.String,
  lot_number: Schema.String,
  building_name: Schema.String,
  agent_id: Schema.String,
  agent_name: Schema.String,
  day: Schema.String,
  status: CleaningStatus,
  template_name: Schema.String,
  note: Schema.String,
  report: Schema.String,
  completed_at: Schema.NullOr(Schema.String),
  completed_by: Schema.NullOr(Schema.String),
  total: Schema.Number,
  handled: Schema.Number,
  issues: Schema.Number,
  remarks: Schema.Array(Schema.String),
})
export type CleaningTask = typeof CleaningTask.Type
export const CleaningTaskPage = Schema.Struct({ items: Schema.Array(CleaningTask), total: Schema.Number })
export const CleaningItemInput = Schema.Struct({ state: CleaningItemState, note: OptionalText(500) })
export const CleaningItem = Schema.Struct({
  id: Schema.String,
  kind: CleaningItemKind,
  label: Schema.String,
  state: CleaningItemState,
  note: Schema.String,
  updated_by: Schema.NullOr(Schema.String),
  updated_at: Schema.NullOr(Schema.String),
})
export type CleaningItem = typeof CleaningItem.Type
export const CleaningTaskDetail = Schema.Struct({ task: CleaningTask, items: Schema.Array(CleaningItem) })

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
  | InvalidInput

export const MAX_PERIOD_DAYS = 41
export const PAGE_SIZE = 20
