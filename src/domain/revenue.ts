import { Schema } from 'effect'
import type { InvalidInput } from './errors.ts'
import { toTSV } from './rules.ts'
import { OptionalText, RequiredText } from './shared.ts'

const periodMessage = 'Mois invalide (AAAA-MM).'
export const Period = Schema.String.check(Schema.isPattern(/^2\d{3}-(0[1-9]|1[0-2])$/, { message: periodMessage }))
const amountMessage = 'Saisissez un montant positif ou nul, au centime près, d’un milliard d’euros au plus.'
const amountCents = Schema.Number.check(
  Schema.isInt({ message: amountMessage }),
  Schema.isGreaterThanOrEqualTo(0, { message: amountMessage }),
  Schema.isLessThanOrEqualTo(100000000000, { message: amountMessage }),
)
export const RevenueSourceInput = Schema.Struct({
  name: RequiredText('Nom de la source', 80),
  description: OptionalText(200),
})
export const RevenueSource = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  latest_period: Schema.NullOr(Schema.String),
  latest_amount: Schema.NullOr(Schema.Number),
  month_amount: Schema.NullOr(Schema.Number),
})
export type RevenueSource = typeof RevenueSource.Type
export const RevenuePage = Schema.Struct({
  items: Schema.Array(RevenueSource),
  total: Schema.Number,
  pending: Schema.Number,
  month_total: Schema.Number,
})
export const RevenueEntryInput = Schema.Struct({
  period: Period,
  amount_cents: amountCents,
  comment: OptionalText(500),
})
export const RevenueEntry = Schema.Struct({
  id: Schema.String,
  period: Schema.String,
  amount_cents: Schema.Number,
  comment: Schema.String,
  actor: Schema.String,
  updated_at: Schema.String,
})
export type RevenueEntry = typeof RevenueEntry.Type
export const RevenueEntryPage = Schema.Struct({ items: Schema.Array(RevenueEntry), total: Schema.Number })
export const RevenueYearQuery = Schema.NumberFromString.check(
  Schema.isInt({ message: 'Année invalide.' }),
  Schema.isGreaterThanOrEqualTo(2000, { message: 'Année invalide.' }),
  Schema.isLessThanOrEqualTo(2100, { message: 'Année invalide.' }),
)
export const RevenueYearRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  months: Schema.Array(Schema.NullOr(Schema.Number)),
  total: Schema.Number,
})
export type RevenueYearRow = typeof RevenueYearRow.Type
export const RevenueYear = Schema.Struct({
  year: Schema.Number,
  rows: Schema.Array(RevenueYearRow),
  months: Schema.Array(Schema.Number),
  total: Schema.Number,
  tsv: Schema.String,
})

export class RevenueSourceNotFound extends Schema.TaggedError<RevenueSourceNotFound>()('RevenueSourceNotFound', {}) {}
export class RevenueEntryNotFound extends Schema.TaggedError<RevenueEntryNotFound>()('RevenueEntryNotFound', {}) {}
export class RevenueSourceNameTaken extends Schema.TaggedError<RevenueSourceNameTaken>()(
  'RevenueSourceNameTaken',
  {},
) {}
export class RevenuePeriodTaken extends Schema.TaggedError<RevenuePeriodTaken>()('RevenuePeriodTaken', {}) {}

export type RevenueError =
  | RevenueSourceNotFound
  | RevenueEntryNotFound
  | RevenueSourceNameTaken
  | RevenuePeriodTaken
  | InvalidInput

export const PAGE_SIZE = 20

export const periodsOf = (year: number) =>
  Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
const periodHeader = (period: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(period + '-01'))

export const revenueYear = (
  year: number,
  sources: ReadonlyArray<{ id: string; name: string }>,
  entries: ReadonlyArray<{ source_id: string; period: string; amount_cents: number }>,
) => {
  const periods = periodsOf(year)
  const rows = sources.map((source) => {
    const months = periods.map(
      (period) =>
        entries.find((entry) => entry.source_id === source.id && entry.period === period)?.amount_cents ?? null,
    )
    return {
      id: source.id,
      name: source.name,
      months,
      total: months.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    }
  })
  const months = periods.map((_, index) => rows.reduce((sum, row) => sum + (row.months[index] ?? 0), 0))
  const total = months.reduce((sum, value) => sum + value, 0)
  const tsv = toTSV([
    ['Source', ...periods.map(periodHeader), 'Total'],
    ...rows.map((row) => [
      row.name,
      ...row.months.map((value) => (value === null ? '' : euros(value))),
      euros(row.total),
    ]),
    ['Total', ...months.map(euros), euros(total)],
  ])
  return { year, rows, months, total, tsv }
}
