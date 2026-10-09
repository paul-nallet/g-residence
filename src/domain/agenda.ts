import { Schema } from 'effect'
import { toTSV } from './rules.ts'

export const Event = Schema.Struct({
  id: Schema.String,
  lotId: Schema.String,
  lotNumber: Schema.String,
  kind: Schema.Literals(['entry', 'exit', 'inspection_entry', 'inspection_exit']),
  date: Schema.String,
  time: Schema.String,
  duration: Schema.Number,
  status: Schema.String,
  resident: Schema.String,
  comment: Schema.String,
})
export type Event = typeof Event.Type
export const ReportRow = Schema.Struct({
  date: Schema.String,
  lot: Schema.String,
  kind: Schema.String,
  lastName: Schema.String,
  firstName: Schema.String,
  comment: Schema.String,
})
export type ReportRow = typeof ReportRow.Type
export const Report = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  rows: Schema.Array(ReportRow),
  tsv: Schema.String,
})
export type Report = typeof Report.Type

export const MAX_CALENDAR_DAYS = 62

type Resident = { first_name: string; last_name: string }
type StayEvents = Resident & {
  id: string
  lot_id: string
  number: string
  planned_start: string
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
}

export const residentName = (hidden: boolean, resident: Resident) =>
  hidden ? '' : `${resident.first_name} ${resident.last_name}`

export const stayEvents = (stay: StayEvents, from: string, to: string, hidden: boolean): Event[] => {
  const base = { lotId: stay.lot_id, lotNumber: stay.number, time: '', duration: 0, comment: '' }
  const resident = residentName(hidden, stay)
  return [
    ...(stay.planned_start >= from && stay.planned_start <= to
      ? [
          {
            ...base,
            id: stay.id + ':entry',
            kind: 'entry' as const,
            date: stay.planned_start,
            status: stay.actual_start ? 'done' : 'planned',
            resident,
          },
        ]
      : []),
    ...(stay.planned_end && stay.planned_end >= from && stay.planned_end <= to
      ? [
          {
            ...base,
            id: stay.id + ':exit',
            kind: 'exit' as const,
            date: stay.planned_end,
            status: stay.actual_end ? 'done' : 'planned',
            resident,
          },
        ]
      : []),
  ]
}

export const sortEvents = (events: Event[]) =>
  events.sort((a, b) => (a.date + a.time + a.lotNumber + a.id).localeCompare(b.date + b.time + b.lotNumber + b.id))

export const reportOf = (from: string, to: string, rows: ReportRow[]): Report => {
  rows.sort((a, b) => (a.date + a.lot + a.kind).localeCompare(b.date + b.lot + b.kind))
  return {
    from,
    to,
    rows,
    tsv: toTSV([
      ['Date', 'Lot', 'Type d’événement', 'Nom', 'Prénom', 'Commentaire'],
      ...rows.map((row) => [
        row.date.split('-').toReversed().join('/'),
        row.lot,
        row.kind,
        row.lastName,
        row.firstName,
        row.comment,
      ]),
    ]),
  }
}
