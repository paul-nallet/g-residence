import { Schema } from 'effect'
import { toTSV } from './rules.ts'

export const Event = Schema.Struct({
  id: Schema.String,
  lotId: Schema.String,
  lotNumber: Schema.String,
  kind: Schema.Literals(['entry', 'exit', 'inspection_entry', 'inspection_exit', 'intervention', 'technical_visit']),
  date: Schema.String,
  time: Schema.String,
  duration: Schema.Number,
  status: Schema.String,
  resident: Schema.String,
  comment: Schema.String,
  workId: Schema.optionalKey(Schema.String),
  visitId: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
  place: Schema.optionalKey(Schema.String),
})
export type Event = typeof Event.Type
export const ReportRow = Schema.Struct({
  module: Schema.String,
  subject: Schema.String,
  actor: Schema.String,
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
  total: Schema.Number,
  tsv: Schema.String,
})
export type Report = typeof Report.Type

export const MAX_CALENDAR_DAYS = 62
export const OVERDUE_LIMIT = 50

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

export const REPORT_PAGE_SIZE = 20
const civil = (date: string) => date.split('-').toReversed().join('/')

export const reportOf = (from: string, to: string, rows: ReportRow[], page?: number): Report => {
  rows.sort((a, b) =>
    (a.date + a.module + a.lot + a.kind + a.subject).localeCompare(b.date + b.module + b.lot + b.kind + b.subject),
  )
  return {
    from,
    to,
    rows: page === undefined ? rows : rows.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE),
    total: rows.length,
    tsv: toTSV([
      [`Bilan du ${civil(from)} au ${civil(to)}`],
      ['Date', 'Module', 'Lot', 'Objet / lieu', 'Type d’événement', 'Intervenant', 'Nom', 'Prénom', 'Commentaire'],
      ...rows.map((row) => [
        civil(row.date),
        row.module,
        row.lot,
        row.subject,
        row.kind,
        row.actor,
        row.lastName,
        row.firstName,
        row.comment,
      ]),
    ]),
  }
}
