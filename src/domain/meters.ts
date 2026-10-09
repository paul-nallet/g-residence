import { Schema } from 'effect'
import type { InvalidInput } from './errors.ts'
import { CivilDate, OptionalText, RequiredText } from './shared.ts'

export const MeterKind = Schema.Literals(['water', 'electricity', 'gas'])
export type MeterKind = typeof MeterKind.Type
export const MeterInput = Schema.Struct({
  name: RequiredText('Nom du compteur'),
  location: RequiredText('Emplacement'),
  reference: OptionalText(160),
  kind: MeterKind,
  unit: Schema.Literals(['m3', 'kWh']),
})
export const Meter = Schema.Struct({
  id: Schema.String,
  ...MeterInput.fields,
  latest_date: Schema.NullOr(Schema.String),
  latest_value: Schema.NullOr(Schema.Number),
  month_date: Schema.NullOr(Schema.String),
})
export type Meter = typeof Meter.Type
export const MeterPage = Schema.Struct({ items: Schema.Array(Meter), total: Schema.Number })
export const ReadingInput = Schema.Struct({
  observed_on: CivilDate,
  value: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1e12)),
})
export const Reading = Schema.Struct({
  id: Schema.String,
  observed_on: Schema.String,
  value: Schema.Number,
  actor: Schema.String,
})
export type Reading = typeof Reading.Type
export const ReadingPage = Schema.Struct({ items: Schema.Array(Reading), total: Schema.Number })
export const MonthlyConsumption = Schema.Struct({
  month: Schema.String,
  value: Schema.NullOr(Schema.Number),
  from: Schema.NullOr(Schema.String),
  to: Schema.NullOr(Schema.String),
  reset: Schema.Boolean,
})
export type MonthlyConsumption = typeof MonthlyConsumption.Type
export const ConsumptionYear = Schema.Struct({
  year: Schema.Number,
  total: Schema.Number,
  months: Schema.Array(MonthlyConsumption),
})

export class MeterNotFound extends Schema.TaggedError<MeterNotFound>()('MeterNotFound', {}) {}
export class ReadingNotFound extends Schema.TaggedError<ReadingNotFound>()('ReadingNotFound', {}) {}
export class MeterNameTaken extends Schema.TaggedError<MeterNameTaken>()('MeterNameTaken', {}) {}
export class ReadingDateTaken extends Schema.TaggedError<ReadingDateTaken>()('ReadingDateTaken', {}) {}

export type MetersError = MeterNotFound | ReadingNotFound | MeterNameTaken | ReadingDateTaken | InvalidInput

export const PAGE_SIZE = 20
export const unitMatchesKind = (kind: 'water' | 'electricity' | 'gas', unit: 'm3' | 'kWh') =>
  !((kind === 'water' && unit !== 'm3') || (kind === 'electricity' && unit !== 'kWh'))
