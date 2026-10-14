import { Schema } from 'effect'
import { OptionalText, PageNumber, RequiredText } from './shared.ts'
import { Event } from './agenda.ts'
import { Inspection, Notice, Stay } from './stays.ts'

export const BuildingInput = Schema.Struct({ name: RequiredText('Nom du bâtiment', 80) })
export const Building = Schema.Struct({ id: Schema.String, name: Schema.String })
export type Building = typeof Building.Type
export const LotInput = Schema.Struct({
  number: RequiredText('Numéro', 40),
  floor: OptionalText(40),
  type: OptionalText(80),
  building_id: RequiredText('Bâtiment', 200),
})
export const Occupancy = Schema.Literals(['vacant', 'planned', 'occupied'])
export const LotStateFilter = Schema.Literals(['all', ...Occupancy.literals]).annotate({ message: 'Filtre invalide.' })
export type LotStateFilter = typeof LotStateFilter.Type
export const LotArchiveFilter = Schema.Literals(['no', 'yes']).annotate({ message: 'Filtre invalide.' })
export type LotArchiveFilter = typeof LotArchiveFilter.Type
export const LotSort = Schema.Literals(['number', 'floor']).annotate({ message: 'Tri invalide.' })
export type LotSort = typeof LotSort.Type
export const LotQuery = {
  q: Schema.optionalKey(Schema.String),
  building: Schema.optionalKey(Schema.String),
  state: Schema.optionalKey(LotStateFilter),
  archived: Schema.optionalKey(LotArchiveFilter),
  page: Schema.optionalKey(PageNumber(100000)),
  sort: Schema.optionalKey(LotSort),
}
export const Lot = Schema.Struct({
  building_id: Schema.String,
  building_name: Schema.String,
  id: Schema.String,
  number: Schema.String,
  floor: Schema.String,
  type: Schema.String,
  archived: Schema.Number,
  occupancy: Occupancy,
})
export type Lot = typeof Lot.Type
export const LotRow = Schema.Struct({
  ...Lot.fields,
  resident: Schema.String,
  stay_start: Schema.NullOr(Schema.String),
  stay_end: Schema.NullOr(Schema.String),
  notice: Schema.Number,
})
export type LotRow = typeof LotRow.Type
export const LotPage = Schema.Struct({
  items: Schema.Array(LotRow),
  total: Schema.Number,
  page: Schema.Number,
  pageSize: Schema.Number,
})
export const History = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  actor: Schema.String,
  created_at: Schema.String,
  before_json: Schema.NullOr(Schema.String),
  after_json: Schema.String,
})
export const LotDetail = Schema.Struct({
  lot: Lot,
  stays: Schema.Array(Stay),
  notices: Schema.Array(Notice),
  inspections: Schema.Array(Inspection),
  history: Schema.Array(History),
  events: Schema.Array(Event),
})

export class LotNotFound extends Schema.TaggedError<LotNotFound>()('LotNotFound', {}) {}
export class BuildingNotFound extends Schema.TaggedError<BuildingNotFound>()('BuildingNotFound', {}) {}
export class LotNumberTaken extends Schema.TaggedError<LotNumberTaken>()('LotNumberTaken', {}) {}
export class BuildingNameTaken extends Schema.TaggedError<BuildingNameTaken>()('BuildingNameTaken', {}) {}
export class BuildingRequired extends Schema.TaggedError<BuildingRequired>()('BuildingRequired', {}) {}
export class BuildingOutOfScope extends Schema.TaggedError<BuildingOutOfScope>()('BuildingOutOfScope', {}) {}
export class LotHasActiveStays extends Schema.TaggedError<LotHasActiveStays>()('LotHasActiveStays', {}) {}

export type LotsError =
  | LotNotFound
  | BuildingNotFound
  | BuildingNameTaken
  | LotNumberTaken
  | BuildingRequired
  | BuildingOutOfScope
  | LotHasActiveStays

export const PAGE_SIZE = 20
export const DETAIL_AGENDA_DAYS = 30
