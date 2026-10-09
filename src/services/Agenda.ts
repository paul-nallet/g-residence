import { Context, Effect, Layer } from 'effect'
import {
  type Event,
  MAX_CALENDAR_DAYS,
  type Report,
  reportOf,
  residentName,
  sortEvents,
  stayEvents,
} from '../domain/agenda.ts'
import { CurrentUser, manager } from '../domain/CurrentUser.ts'
import { InvalidInput } from '../domain/errors.ts'
import type { Inspection, Notice, Stay } from '../domain/stays.ts'
import { addDays, monday, parisDate, parisTime } from '../domain/rules.ts'
import { sql, Sql } from './Database.ts'

type Resident = { number: string; first_name: string; last_name: string }

const make = Effect.gen(function* () {
  const db = yield* Sql

  const calendar = Effect.fn('Agenda.calendar')(function* (from: string, to: string, lotId?: string) {
    const me = yield* CurrentUser
    if (to < from || Date.parse(to) - Date.parse(from) > MAX_CALENDAR_DAYS * 86400000)
      return yield* new InvalidInput({ message: 'Choisissez une période de 63 jours maximum.' })
    const restriction = lotId ? ' AND l.id=?' : '',
      scope = lotId ? [me.residenceId, lotId] : [me.residenceId]
    const hidden = me.role === 'cleaner'
    const [stays, inspections] = yield* Effect.all([
      db.all<Stay & { number: string }>(
        sql(
          `SELECT s.*,l.number FROM stays s JOIN lots l ON l.id=s.lot_id WHERE s.residence_id=? AND s.cancelled=0 ${restriction} AND (s.planned_start BETWEEN ? AND ? OR s.planned_end BETWEEN ? AND ?)`,
          ...scope,
          from,
          to,
          from,
          to,
        ),
      ),
      db.all<Inspection & Resident & { lot_id: string }>(
        sql(
          `SELECT i.*,s.lot_id,s.first_name,s.last_name,l.number FROM inspections i JOIN stays s ON s.id=i.stay_id JOIN lots l ON l.id=s.lot_id WHERE i.residence_id=? AND s.cancelled=0 ${restriction} AND i.starts_at>=? AND i.starts_at<?`,
          ...scope,
          addDays(from, -1) + 'T00:00:00.000Z',
          addDays(to, 1) + 'T23:00:00.000Z',
        ),
      ),
    ])
    const events: Event[] = stays.flatMap((stay) => stayEvents(stay, from, to, hidden))
    for (const inspection of inspections) {
      const date = parisDate(inspection.starts_at)
      if (date < from || date > to) continue
      events.push({
        id: inspection.id,
        lotId: inspection.lot_id,
        lotNumber: inspection.number,
        kind: inspection.kind === 'entry' ? 'inspection_entry' : 'inspection_exit',
        date,
        time: parisTime(inspection.starts_at),
        duration: inspection.duration,
        status: inspection.status,
        resident: residentName(hidden, inspection),
        comment: hidden ? '' : inspection.comment,
      })
    }
    return sortEvents(events)
  })

  const report = Effect.fn('Agenda.report')(function* (date: string) {
    const me = yield* manager
    const from = monday(date),
      to = addDays(from, 6)
    const [stays, notices, inspections] = yield* Effect.all([
      db.all<Stay & { number: string }>(
        sql(
          'SELECT s.*,l.number FROM stays s JOIN lots l ON l.id=s.lot_id WHERE s.residence_id=? AND s.cancelled=0 AND (s.actual_start BETWEEN ? AND ? OR s.actual_end BETWEEN ? AND ?)',
          me.residenceId,
          from,
          to,
          from,
          to,
        ),
      ),
      db.all<Notice & Resident>(
        sql(
          'SELECT n.*,l.number,s.first_name,s.last_name FROM notices n JOIN stays s ON s.id=n.stay_id JOIN lots l ON l.id=s.lot_id WHERE n.residence_id=? AND n.withdrawn=0 AND s.cancelled=0 AND n.received_on BETWEEN ? AND ?',
          me.residenceId,
          from,
          to,
        ),
      ),
      db.all<Inspection & Resident>(
        sql(
          "SELECT i.*,l.number,s.first_name,s.last_name FROM inspections i JOIN stays s ON s.id=i.stay_id JOIN lots l ON l.id=s.lot_id WHERE i.residence_id=? AND i.status='done' AND s.cancelled=0 AND i.completed_on BETWEEN ? AND ?",
          me.residenceId,
          from,
          to,
        ),
      ),
    ])
    const within = (day: string | null): day is string => !!day && day >= from && day <= to
    const rows: Report['rows'][number][] = [
      ...stays.flatMap((stay) =>
        [
          ...(within(stay.actual_start)
            ? [{ date: stay.actual_start, kind: 'Entrée réelle', lot: stay.number, comment: '' }]
            : []),
          ...(within(stay.actual_end)
            ? [{ date: stay.actual_end, kind: 'Sortie réelle', lot: stay.number, comment: '' }]
            : []),
        ].map((row) => ({ ...row, lastName: stay.last_name, firstName: stay.first_name })),
      ),
      ...notices.map((notice) => ({
        date: notice.received_on,
        lot: notice.number,
        kind: 'Préavis reçu',
        lastName: notice.last_name,
        firstName: notice.first_name,
        comment: `Départ prévu : ${notice.departure_on}${notice.comment ? ' — ' + notice.comment : ''}`,
      })),
      ...inspections.map((inspection) => ({
        date: inspection.completed_on!,
        lot: inspection.number,
        kind: inspection.kind === 'entry' ? 'État des lieux d’entrée réalisé' : 'État des lieux de sortie réalisé',
        lastName: inspection.last_name,
        firstName: inspection.first_name,
        comment: inspection.comment,
      })),
    ]
    return reportOf(from, to, rows)
  })

  return { calendar, report }
})

export class Agenda extends Context.Service<Agenda, Effect.Success<typeof make>>()('gresidence/Agenda') {
  static readonly layer = Layer.effect(Agenda, make)
}
