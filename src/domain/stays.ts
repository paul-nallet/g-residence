import { Schema } from 'effect'
import type { InvalidInput } from './errors.ts'
import type { LotNotFound } from './lots.ts'
import { CivilDate, IntegerBetween, LocalDateTime, OptionalText, RequiredText } from './shared.ts'

export const StayInput = Schema.Struct({
  first_name: RequiredText('Prénom', 80),
  last_name: RequiredText('Nom', 80),
  planned_start: CivilDate,
  planned_end: Schema.NullOr(CivilDate),
})
export const Stay = Schema.Struct({
  id: Schema.String,
  lot_id: Schema.String,
  first_name: Schema.String,
  last_name: Schema.String,
  planned_start: Schema.String,
  planned_end: Schema.NullOr(Schema.String),
  actual_start: Schema.NullOr(Schema.String),
  actual_end: Schema.NullOr(Schema.String),
  cancelled: Schema.Number,
})
export type Stay = typeof Stay.Type
export const StayAction = Schema.Struct({ action: Schema.Literals(['entry', 'exit', 'cancel']), date: Schema.String })
export const NoticeInput = Schema.Struct({
  received_on: CivilDate,
  departure_on: CivilDate,
  comment: OptionalText(),
})
export const Notice = Schema.Struct({
  id: Schema.String,
  stay_id: Schema.String,
  received_on: Schema.String,
  departure_on: Schema.String,
  comment: Schema.String,
  withdrawn: Schema.Number,
})
export type Notice = typeof Notice.Type
export const InspectionInput = Schema.Struct({
  kind: Schema.Literals(['entry', 'exit']),
  local_start: LocalDateTime,
  duration: IntegerBetween(5, 480, 'Durée : entre 5 et 480 minutes.'),
  status: Schema.Literals(['planned', 'done', 'cancelled']),
  completed_on: Schema.NullOr(Schema.String),
  comment: OptionalText(),
})
export const Inspection = Schema.Struct({
  id: Schema.String,
  stay_id: Schema.String,
  kind: Schema.Literals(['entry', 'exit']),
  starts_at: Schema.String,
  duration: Schema.Number,
  status: Schema.Literals(['planned', 'done', 'cancelled']),
  completed_on: Schema.NullOr(Schema.String),
  comment: Schema.String,
})
export type Inspection = typeof Inspection.Type

export class StayNotFound extends Schema.TaggedError<StayNotFound>()('StayNotFound', {}) {}
export class NoticeNotFound extends Schema.TaggedError<NoticeNotFound>()('NoticeNotFound', {}) {}
export class InspectionNotFound extends Schema.TaggedError<InspectionNotFound>()('InspectionNotFound', {}) {}
export class LotArchived extends Schema.TaggedError<LotArchived>()('LotArchived', {}) {}
export class LotUnavailable extends Schema.TaggedError<LotUnavailable>()('LotUnavailable', {}) {}
export class StayCancelled extends Schema.TaggedError<StayCancelled>()('StayCancelled', {}) {}
export class StayClosed extends Schema.TaggedError<StayClosed>()('StayClosed', {}) {}
export class StayStarted extends Schema.TaggedError<StayStarted>()('StayStarted', {}) {}
export class StayOverlap extends Schema.TaggedError<StayOverlap>()('StayOverlap', {}) {}
export class PreviousOccupantPresent extends Schema.TaggedError<PreviousOccupantPresent>()(
  'PreviousOccupantPresent',
  {},
) {}
export class DepartureFromNotice extends Schema.TaggedError<DepartureFromNotice>()('DepartureFromNotice', {}) {}

export type StaysError =
  | LotNotFound
  | StayNotFound
  | NoticeNotFound
  | InspectionNotFound
  | LotArchived
  | LotUnavailable
  | StayCancelled
  | StayClosed
  | StayStarted
  | StayOverlap
  | PreviousOccupantPresent
  | DepartureFromNotice
  | InvalidInput

export const inspectionAction = (status: 'planned' | 'done' | 'cancelled', updated: boolean) =>
  status === 'done'
    ? 'État des lieux réalisé'
    : status === 'cancelled'
      ? 'État des lieux annulé'
      : updated
        ? 'État des lieux déplacé ou modifié'
        : 'État des lieux planifié'
