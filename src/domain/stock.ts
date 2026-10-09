import { Schema } from 'effect'
import type { InvalidInput } from './errors.ts'
import { CivilDate, OptionalText, RequiredText } from './shared.ts'

const quantityMessage = 'Saisissez un nombre entier entre 0 et 1 000 000.'
const quantity = Schema.Number.check(
  Schema.isInt({ message: quantityMessage }),
  Schema.isGreaterThanOrEqualTo(0, { message: quantityMessage }),
  Schema.isLessThanOrEqualTo(1000000, { message: quantityMessage }),
)
export const StockItemInput = Schema.Struct({
  name: RequiredText('Nom de l’article'),
  categories: Schema.Array(RequiredText('Catégorie', 80)),
  unit: OptionalText(40),
  threshold: quantity,
})
export const StockItemCreate = Schema.Struct({ ...StockItemInput.fields, initial: quantity })
export const StockCategory = Schema.Struct({ id: Schema.String, name: Schema.String })
export type StockCategory = typeof StockCategory.Type
export const StockViewInput = Schema.Struct({
  name: RequiredText('Nom de la vue', 80),
  categories: Schema.Array(Schema.String).check(
    Schema.isMinLength(1, { message: 'Choisissez au moins une catégorie pour la vue.' }),
  ),
})
export const StockView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  categories: Schema.Array(Schema.String),
  low: Schema.Number,
})
export type StockView = typeof StockView.Type
export const StockLevel = Schema.Literals(['ok', 'low', 'out'])
export type StockLevel = typeof StockLevel.Type
export const StockLevelFilter = Schema.Literals(['all', 'alert']).annotate({ message: 'Filtre invalide.' })
export type StockLevelFilter = typeof StockLevelFilter.Type
export const StockItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  categories: Schema.Array(Schema.String),
  unit: Schema.String,
  threshold: Schema.Number,
  quantity: Schema.Number,
  level: StockLevel,
})
export type StockItem = typeof StockItem.Type
export const StockPage = Schema.Struct({
  items: Schema.Array(StockItem),
  total: Schema.Number,
  low: Schema.Number,
  categories: Schema.Array(StockCategory),
  views: Schema.Array(StockView),
})
export const MovementKind = Schema.Literals(['in', 'out', 'count'])
export type MovementKind = typeof MovementKind.Type
export const MovementInput = Schema.Struct({
  kind: MovementKind,
  quantity,
  occurred_on: CivilDate,
  comment: OptionalText(500),
})
export const Movement = Schema.Struct({
  id: Schema.String,
  kind: MovementKind,
  delta: Schema.Number,
  quantity_after: Schema.Number,
  occurred_on: Schema.String,
  comment: Schema.String,
  actor: Schema.String,
  created_at: Schema.String,
})
export type Movement = typeof Movement.Type
export const MovementPage = Schema.Struct({ items: Schema.Array(Movement), total: Schema.Number })
export const MonthlyMovements = Schema.Struct({
  month: Schema.String,
  entries: Schema.Number,
  exits: Schema.Number,
  adjustments: Schema.Number,
  stock: Schema.NullOr(Schema.Number),
})
export type MonthlyMovements = typeof MonthlyMovements.Type
export const MovementYear = Schema.Struct({
  year: Schema.Number,
  entries: Schema.Number,
  exits: Schema.Number,
  adjustments: Schema.Number,
  months: Schema.Array(MonthlyMovements),
})

export class StockItemNotFound extends Schema.TaggedError<StockItemNotFound>()('StockItemNotFound', {}) {}
export class StockViewNotFound extends Schema.TaggedError<StockViewNotFound>()('StockViewNotFound', {}) {}
export class StockCategoryNotFound extends Schema.TaggedError<StockCategoryNotFound>()('StockCategoryNotFound', {}) {}
export class StockItemNameTaken extends Schema.TaggedError<StockItemNameTaken>()('StockItemNameTaken', {}) {}
export class StockViewNameTaken extends Schema.TaggedError<StockViewNameTaken>()('StockViewNameTaken', {}) {}
export class StockInsufficient extends Schema.TaggedError<StockInsufficient>()('StockInsufficient', {}) {}

export type StockError =
  | StockItemNotFound
  | StockViewNotFound
  | StockCategoryNotFound
  | StockItemNameTaken
  | StockViewNameTaken
  | StockInsufficient
  | InvalidInput

export const PAGE_SIZE = 20
export const MAX_ITEM_CATEGORIES = 20
export const MAX_VIEW_CATEGORIES = 50
export const MAX_VIEWS = 8

export const uniqueCategoryNames = (names: ReadonlyArray<string>) => {
  const unique = new Map<string, string>()
  for (const name of names) {
    const key = name.toLocaleLowerCase('fr-FR')
    if (!unique.has(key)) unique.set(key, name)
  }
  return [...unique.values()]
}

export const movementDelta = (kind: 'in' | 'out' | 'count', quantity: number) =>
  kind === 'count' ? null : kind === 'in' ? quantity : -quantity

export const movementYear = (
  year: number,
  opening: number,
  totals: ReadonlyArray<{ month: string; kind: MovementKind; delta: number }>,
  until: string,
) => {
  let stock = opening
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    const sum = (kind: MovementKind) =>
      totals.filter((row) => row.month === month && row.kind === kind).reduce((total, row) => total + row.delta, 0)
    const entries = sum('in'),
      exits = 0 - sum('out'),
      adjustments = sum('count')
    stock += entries - exits + adjustments
    return { month, entries, exits, adjustments, stock: month <= until.slice(0, 7) ? stock : null }
  })
  const total = (key: 'entries' | 'exits' | 'adjustments') => months.reduce((sum, month) => sum + month[key], 0)
  return { year, entries: total('entries'), exits: total('exits'), adjustments: total('adjustments'), months }
}
