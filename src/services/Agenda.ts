import { Context, Effect, Layer } from 'effect'
import {
  type Event,
  MAX_CALENDAR_DAYS,
  OVERDUE_LIMIT,
  type Report,
  reportOf,
  residentName,
  sortEvents,
  stayEvents,
} from '../domain/agenda.ts'
import { CurrentUser, manager } from '../domain/CurrentUser.ts'
import { InvalidInput } from '../domain/errors.ts'
import type { Inspection, Notice, Stay } from '../domain/stays.ts'
import { currentDay } from '../domain/clock.ts'
import { addDays, monday, parisDate, parisTime } from '../domain/rules.ts'
import { sql, Sql } from './Database.ts'
import { reportActivities } from './ReportActivities.ts'

type Resident = { number: string; first_name: string; last_name: string }
type Intervention = {
  id: string
  work_id: string
  title: string
  starts_at: string
  duration: number
  status: string
  report: string
  supplier: string
  place: string | null
}

type InspectionRow = Inspection & Resident & { lot_id: string }
const inspectionEvent = (inspection: InspectionRow, hidden: boolean): Event => ({
  id: inspection.id,
  lotId: inspection.lot_id,
  lotNumber: inspection.number,
  kind: inspection.kind === 'entry' ? 'inspection_entry' : 'inspection_exit',
  date: parisDate(inspection.starts_at),
  time: parisTime(inspection.starts_at),
  duration: inspection.duration,
  status: inspection.status,
  resident: residentName(hidden, inspection),
  comment: hidden ? '' : inspection.comment,
})

const make = Effect.gen(function* () {
  const db = yield* Sql

  const calendar = Effect.fn('Agenda.calendar')(function* (from: string, to: string, lotId?: string) {
    const me = yield* CurrentUser
    if (to < from || Date.parse(to) - Date.parse(from) > MAX_CALENDAR_DAYS * 86400000)
      return yield* new InvalidInput({ message: 'Choisissez une période de 63 jours maximum.' })
    const restriction = lotId ? ' AND l.id=?' : '',
      scope = lotId ? [me.residenceId, lotId] : [me.residenceId]
    const hidden = me.role === 'cleaner'
    const window = [addDays(from, -1) + 'T00:00:00.000Z', addDays(to, 1) + 'T23:00:00.000Z'] as const
    const [stays, inspections, interventions, visits] = yield* Effect.all([
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
      db.all<InspectionRow>(
        sql(
          `SELECT i.*,s.lot_id,s.first_name,s.last_name,l.number FROM inspections i JOIN stays s ON s.id=i.stay_id JOIN lots l ON l.id=s.lot_id WHERE i.residence_id=? AND s.cancelled=0 ${restriction} AND i.starts_at>=? AND i.starts_at<?`,
          ...scope,
          ...window,
        ),
      ),
      hidden
        ? Effect.succeed([])
        : db.all<Intervention>(
            sql(
              `SELECT i.id,i.work_id,w.title,i.starts_at,i.duration,i.status,i.report,COALESCE(s.name,'') AS supplier,
              (SELECT group_concat(label,', ') FROM (SELECT CASE WHEN x.lot_id IS NOT NULL THEN 'Lot ' || l.number ELSE p.name END AS label
                FROM work_locations x LEFT JOIN lots l ON l.id=x.lot_id LEFT JOIN places p ON p.id=x.place_id WHERE x.work_id=w.id
                ORDER BY x.lot_id IS NULL,l.number COLLATE NOCASE,p.name COLLATE NOCASE)) AS place
              FROM interventions i JOIN works w ON w.id=i.work_id LEFT JOIN suppliers s ON s.id=i.supplier_id
              WHERE i.residence_id=? AND i.starts_at>=? AND i.starts_at<?
              ${lotId ? 'AND EXISTS(SELECT 1 FROM work_locations x WHERE x.work_id=i.work_id AND x.lot_id=?)' : ''}`,
              me.residenceId,
              ...window,
              ...(lotId ? [lotId] : []),
            ),
          ),
      hidden || lotId
        ? Effect.succeed([])
        : db.all<{ id: string; name: string; building: string; scheduled_on: string; status: string; report: string }>(
            sql(
              `SELECT v.id,v.name,b.name AS building,v.scheduled_on,v.status,v.report FROM technical_visits v JOIN buildings b ON b.id=v.building_id WHERE v.residence_id=? AND v.scheduled_on BETWEEN ? AND ?`,
              me.residenceId,
              from,
              to,
            ),
          ),
    ])
    const events: Event[] = [
      ...stays.flatMap((stay) => stayEvents(stay, from, to, hidden)),
      ...inspections
        .map((inspection) => inspectionEvent(inspection, hidden))
        .filter((e) => e.date >= from && e.date <= to),
    ]
    for (const intervention of interventions) {
      const date = parisDate(intervention.starts_at)
      if (date < from || date > to) continue
      events.push({
        id: intervention.id,
        lotId: '',
        lotNumber: '',
        kind: 'intervention',
        date,
        time: parisTime(intervention.starts_at),
        duration: intervention.duration,
        status: intervention.status,
        resident: intervention.supplier,
        comment: intervention.report,
        workId: intervention.work_id,
        title: intervention.title,
        place: intervention.place ?? '',
      })
    }
    for (const visit of visits)
      events.push({
        id: visit.id,
        visitId: visit.id,
        kind: 'technical_visit',
        lotId: '',
        lotNumber: '',
        date: visit.scheduled_on,
        time: '',
        duration: 0,
        status: visit.status,
        resident: '',
        comment: visit.report,
        title: visit.name,
        place: visit.building,
      })
    return sortEvents(events)
  })

  const overdue = Effect.fn('Agenda.overdue')(function* () {
    const me = yield* CurrentUser
    const day = yield* currentDay
    const hidden = me.role === 'cleaner'
    const [stays, inspections] = yield* Effect.all([
      db.all<Stay & { number: string }>(
        sql(
          `SELECT s.*,l.number FROM stays s JOIN lots l ON l.id=s.lot_id WHERE s.residence_id=? AND s.cancelled=0
          AND ((s.actual_start IS NULL AND s.planned_start<?) OR (s.actual_end IS NULL AND s.planned_end<?))
          ORDER BY min(CASE WHEN s.actual_start IS NULL THEN s.planned_start ELSE '9999' END,
            CASE WHEN s.actual_end IS NULL THEN s.planned_end ELSE '9999' END) LIMIT ?`,
          me.residenceId,
          day,
          day,
          OVERDUE_LIMIT,
        ),
      ),
      db.all<InspectionRow>(
        sql(
          `SELECT i.*,s.lot_id,s.first_name,s.last_name,l.number FROM inspections i JOIN stays s ON s.id=i.stay_id JOIN lots l ON l.id=s.lot_id
          WHERE i.residence_id=? AND s.cancelled=0 AND i.status='planned' AND i.starts_at<? ORDER BY i.starts_at LIMIT ?`,
          me.residenceId,
          day + 'T00:00:00.000Z',
          OVERDUE_LIMIT,
        ),
      ),
    ])
    const events = [
      ...stays.flatMap((stay) => stayEvents(stay, '0000-01-01', addDays(day, -1), hidden)),
      ...inspections.map((inspection) => inspectionEvent(inspection, hidden)),
    ].filter((event) => event.status === 'planned' && event.date < day)
    return sortEvents(events).slice(0, OVERDUE_LIMIT)
  })

  const report = Effect.fn('Agenda.report')(function* (date: string, page?: number) {
    const me = yield* manager
    const from = monday(date),
      to = addDays(from, 6)
    const subject = `'Lot ' || l.number || COALESCE(' · ' || b.name,'')`
    const actor = (id: string, preferred: string) => `(SELECT u.name FROM history h JOIN users u ON u.id=h.actor_id
      WHERE h.residence_id=l.residence_id AND h.lot_id=l.id AND json_extract(h.after_json,'$.id')=${id}
      ORDER BY h.action='${preferred}' DESC,h.created_at DESC LIMIT 1)`
    const lots = 'JOIN lots l ON l.id=s.lot_id LEFT JOIN buildings b ON b.id=l.building_id'
    type Movement = { subject: string; actor: string | null }
    const [stays, notices, inspections] = yield* Effect.all([
      db.all<Stay & Movement & { number: string; exit_actor: string | null }>(
        sql(
          `SELECT s.*,l.number,${subject} AS subject,${actor('s.id', 'Entrée réelle confirmée ou corrigée')} AS actor,
          ${actor('s.id', 'Sortie réelle confirmée ou corrigée')} AS exit_actor
          FROM stays s ${lots} WHERE s.residence_id=? AND s.cancelled=0 AND (s.actual_start BETWEEN ? AND ? OR s.actual_end BETWEEN ? AND ?)`,
          me.residenceId,
          from,
          to,
          from,
          to,
        ),
      ),
      db.all<Notice & Resident & Movement>(
        sql(
          `SELECT n.*,l.number,s.first_name,s.last_name,${subject} AS subject,${actor('n.id', 'Préavis reçu')} AS actor
          FROM notices n JOIN stays s ON s.id=n.stay_id ${lots} WHERE n.residence_id=? AND n.withdrawn=0 AND s.cancelled=0 AND n.received_on BETWEEN ? AND ?`,
          me.residenceId,
          from,
          to,
        ),
      ),
      db.all<Inspection & Resident & Movement>(
        sql(
          `SELECT i.*,l.number,s.first_name,s.last_name,${subject} AS subject,${actor('i.id', 'État des lieux réalisé')} AS actor
          FROM inspections i JOIN stays s ON s.id=i.stay_id ${lots} WHERE i.residence_id=? AND i.status='done' AND s.cancelled=0 AND i.completed_on BETWEEN ? AND ?`,
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
            ? [{ date: stay.actual_start, kind: 'Entrée réelle', actor: stay.actor ?? '' }]
            : []),
          ...(within(stay.actual_end)
            ? [{ date: stay.actual_end, kind: 'Sortie réelle', actor: stay.exit_actor ?? '' }]
            : []),
        ].map((row) => ({
          ...row,
          module: 'Mouvements',
          lot: stay.number,
          subject: stay.subject,
          comment: '',
          lastName: stay.last_name,
          firstName: stay.first_name,
        })),
      ),
      ...notices.map((notice) => ({
        module: 'Mouvements',
        subject: notice.subject,
        actor: notice.actor ?? '',
        date: notice.received_on,
        lot: notice.number,
        kind: 'Préavis reçu',
        lastName: notice.last_name,
        firstName: notice.first_name,
        comment: `Départ prévu : ${notice.departure_on}${notice.comment ? ' — ' + notice.comment : ''}`,
      })),
      ...inspections.map((inspection) => ({
        module: 'Mouvements',
        subject: inspection.subject,
        actor: inspection.actor ?? '',
        date: inspection.completed_on!,
        lot: inspection.number,
        kind: inspection.kind === 'entry' ? 'État des lieux d’entrée réalisé' : 'État des lieux de sortie réalisé',
        lastName: inspection.last_name,
        firstName: inspection.first_name,
        comment: inspection.comment,
      })),
    ]
    rows.push(...(yield* reportActivities(db, me, from, to)))
    return reportOf(from, to, rows, page)
  })

  return { calendar, overdue, report }
})

export class Agenda extends Context.Service<Agenda, Effect.Success<typeof make>>()('gresidence/Agenda') {
  static readonly layer = Layer.effect(Agenda, make)
}
