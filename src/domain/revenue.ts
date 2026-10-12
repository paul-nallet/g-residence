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
export const VatMode = Schema.Literals(['ttc', 'ht'])
export type VatMode = typeof VatMode.Type
export const vatRates = [0, 210, 550, 1000, 2000] as const
export const VatRate = Schema.Literals(vatRates)
export type VatRate = typeof VatRate.Type
export const DEFAULT_VAT_RATE: VatRate = 2000
export const RevenueSourceInput = Schema.Struct({
  name: RequiredText('Nom de la source', 80),
  description: OptionalText(200),
  vat_mode: VatMode,
  vat_rate: Schema.NullOr(VatRate),
})
export const RevenueSource = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  vat_mode: VatMode,
  vat_rate: Schema.NullOr(Schema.Number),
  latest_period: Schema.NullOr(Schema.String),
  latest_amount: Schema.NullOr(Schema.Number),
  latest_vat_mode: Schema.NullOr(VatMode),
  month_amount: Schema.NullOr(Schema.Number),
  month_vat_mode: Schema.NullOr(VatMode),
})
export type RevenueSource = typeof RevenueSource.Type
export const RevenuePage = Schema.Struct({
  items: Schema.Array(RevenueSource),
  total: Schema.Number,
  pending: Schema.Number,
  month_net: Schema.Number,
  month_gross: Schema.Number,
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
  vat_mode: VatMode,
  vat_rate: Schema.NullOr(Schema.Number),
  net_cents: Schema.Number,
  vat_cents: Schema.NullOr(Schema.Number),
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
const MonthAmounts = Schema.Array(Schema.NullOr(Schema.Number))
export const RevenueYearRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  vat_mode: VatMode,
  vat_rate: Schema.NullOr(Schema.Number),
  months: MonthAmounts,
  net: MonthAmounts,
  total: Schema.Number,
  total_net: Schema.Number,
  total_vat: Schema.NullOr(Schema.Number),
})
export type RevenueYearRow = typeof RevenueYearRow.Type
const YearTotals = Schema.Struct({ months: Schema.Array(Schema.Number), total: Schema.Number })
export const RevenueYear = Schema.Struct({
  year: Schema.Number,
  rows: Schema.Array(RevenueYearRow),
  net: YearTotals,
  gross: YearTotals,
  vat: YearTotals,
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

export const netOf = (amount: number, rate: number) =>
  Math.floor((2 * amount * 10000 + 10000 + rate) / (2 * (10000 + rate)))

export const vatBreakdown = (amount: number, mode: VatMode, rate: number | null) =>
  mode === 'ht' || rate === null
    ? { vat_mode: 'ht' as const, vat_rate: null, net_cents: amount, vat_cents: null }
    : {
        vat_mode: 'ttc' as const,
        vat_rate: rate,
        net_cents: netOf(amount, rate),
        vat_cents: amount - netOf(amount, rate),
      }

const percent = (rate: number) => (rate / 100).toLocaleString('fr-FR') + ' %'
export const vatLabel = (mode: VatMode, rate: number | null) =>
  mode === 'ht' ? 'HT' : 'TTC' + (rate === null ? '' : ' ' + percent(rate))

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
const periodHeader = (period: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(period + '-01'))

type YearEntry = {
  source_id: string
  period: string
  amount_cents: number
  vat_mode: VatMode
  net_cents: number
  vat_cents: number | null
}
const sum = (values: ReadonlyArray<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
const totals = (months: number[]) => ({ months, total: sum(months) })

export const revenueYear = (
  year: number,
  sources: ReadonlyArray<{ id: string; name: string; vat_mode: VatMode; vat_rate: number | null }>,
  entries: ReadonlyArray<YearEntry>,
) => {
  const periods = periodsOf(year)
  const cells = (source: string) =>
    periods.map((period) => entries.find((entry) => entry.source_id === source && entry.period === period) ?? null)
  const rows = sources.map((source) => {
    const found = cells(source.id)
    const ttc = found.filter((entry) => entry?.vat_mode === 'ttc')
    return {
      id: source.id,
      name: source.name,
      vat_mode: source.vat_mode,
      vat_rate: source.vat_rate,
      months: found.map((entry) => entry?.amount_cents ?? null),
      net: found.map((entry) => entry?.net_cents ?? null),
      total: sum(found.map((entry) => entry?.amount_cents ?? null)),
      total_net: sum(found.map((entry) => entry?.net_cents ?? null)),
      total_vat: ttc.length ? sum(ttc.map((entry) => entry?.vat_cents ?? null)) : null,
    }
  })
  const column = (pick: (entry: YearEntry) => number | null) =>
    totals(periods.map((period) => sum(entries.filter((entry) => entry.period === period).map(pick))))
  const net = column((entry) => entry.net_cents),
    gross = column((entry) => (entry.vat_mode === 'ttc' ? entry.amount_cents : null)),
    vat = column((entry) => entry.vat_cents)
  const tsv = toTSV([
    ['Source', 'Saisie', ...periods.map(periodHeader), 'Total saisi', 'Total HT', 'TVA'],
    ...rows.map((row) => [
      row.name,
      vatLabel(row.vat_mode, row.vat_rate),
      ...row.months.map((value) => (value === null ? '' : euros(value))),
      euros(row.total),
      euros(row.total_net),
      row.total_vat === null ? '' : euros(row.total_vat),
    ]),
    ['Total HT', 'toutes sources', ...net.months.map(euros), '', euros(net.total), ''],
    ['Total TTC', 'sources TTC', ...gross.months.map(euros), euros(gross.total), '', ''],
    ['TVA', 'sources TTC', ...vat.months.map(euros), '', '', euros(vat.total)],
  ])
  return { year, rows, net, gross, vat, tsv }
}
