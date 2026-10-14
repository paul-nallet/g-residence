import { Context, Effect, Layer } from 'effect'
import { currentDay, now } from '../domain/clock.ts'
import { manager } from '../domain/CurrentUser.ts'
import { InvalidInput } from '../domain/errors.ts'
import { LotNotFound } from '../domain/lots.ts'
import type { Me } from '../domain/accounts.ts'
import { appointmentInstant, isCivilDate } from '../domain/rules.ts'
import {
  DepartureFromNotice,
  type Inspection,
  inspectionAction,
  type InspectionInput,
  InspectionNotFound,
  LotArchived,
  LotUnavailable,
  type Notice,
  type NoticeInput,
  NoticeNotFound,
  PreviousOccupantPresent,
  type Stay,
  StayCancelled,
  StayClosed,
  type StayInput,
  StayNotFound,
  StayOverlap,
  StayStarted,
} from '../domain/stays.ts'
import { onViolation, sql, Sql, type SqlError, type Statement } from './Database.ts'
import { auditStatement } from './History.ts'

type NoticeRow = Notice & { previous_end: string | null }
type StayRow = Stay & { residence_id: string }

const stayViolations = <A, E, R>(self: Effect.Effect<A, E | SqlError, R>) =>
  self.pipe(
    onViolation('stay_overlap', () => new StayOverlap()),
    onViolation('stay_started', () => new StayStarted()),
    onViolation('lot_unavailable', () => new LotUnavailable()),
    onViolation('UNIQUE constraint failed: stays.lot_id', () => new PreviousOccupantPresent()),
  )

const make = Effect.gen(function* () {
  const db = yield* Sql
  const write = (statements: Statement[]) => stayViolations(db.batch(statements))

  const findLot = Effect.fn('Stays.findLot')(function* (me: Me, id: string) {
    const row = yield* db.first<{ archived: number }>(
      sql('SELECT archived FROM lots WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!row) return yield* new LotNotFound()
    return row
  })
  const findStay = Effect.fn('Stays.findStay')(function* (me: Me, id: string) {
    const row = yield* db.first<StayRow>(sql('SELECT * FROM stays WHERE id=? AND residence_id=?', id, me.residenceId))
    if (!row) return yield* new StayNotFound()
    return row
  })
  const activeStay = Effect.fn('Stays.activeStay')(function* (me: Me, id: string) {
    const row = yield* findStay(me, id)
    if (row.cancelled || row.actual_end) return yield* new StayClosed()
    if ((yield* findLot(me, row.lot_id)).archived) return yield* new LotArchived()
    return row
  })

  const saveStay = Effect.fn('Stays.saveStay')(function* (
    me: Me,
    lotId: string,
    before: StayRow | null,
    input: typeof StayInput.Type,
  ) {
    if ((yield* findLot(me, lotId)).archived) return yield* new LotArchived()
    if (before?.cancelled) return yield* new StayCancelled()
    if (
      before &&
      (yield* db.first(sql('SELECT id FROM notices WHERE stay_id=? AND withdrawn=0', before.id))) &&
      input.planned_end !== before.planned_end
    )
      return yield* new DepartureFromNotice()
    if (input.planned_end && input.planned_end <= input.planned_start)
      return yield* new InvalidInput({ message: 'La sortie prévue doit suivre l’entrée prévue.' })
    const stayId = before?.id ?? crypto.randomUUID()
    yield* write([
      before
        ? sql(
            'UPDATE stays SET first_name=?,last_name=?,planned_start=?,planned_end=? WHERE id=? AND residence_id=?',
            input.first_name,
            input.last_name,
            input.planned_start,
            input.planned_end,
            stayId,
            me.residenceId,
          )
        : sql(
            'INSERT INTO stays(id,residence_id,lot_id,first_name,last_name,planned_start,planned_end) VALUES(?,?,?,?,?,?,?)',
            stayId,
            me.residenceId,
            lotId,
            input.first_name,
            input.last_name,
            input.planned_start,
            input.planned_end,
          ),
      auditStatement(me, yield* now, lotId, before ? 'Séjour corrigé' : 'Séjour créé', before, {
        id: stayId,
        ...input,
      }),
    ])
    return { ok: true }
  })

  const createStay = Effect.fn('Stays.createStay')(function* (lotId: string, input: typeof StayInput.Type) {
    return yield* saveStay(yield* manager, lotId, null, input)
  })

  const updateStay = Effect.fn('Stays.updateStay')(function* (id: string, input: typeof StayInput.Type) {
    const me = yield* manager
    const before = yield* findStay(me, id)
    return yield* saveStay(me, before.lot_id, before, input)
  })

  const stayAction = Effect.fn('Stays.stayAction')(function* (
    id: string,
    input: { action: 'entry' | 'exit' | 'cancel'; date: string },
  ) {
    const me = yield* manager
    const before = yield* findStay(me, id)
    if (before.cancelled) return yield* new StayCancelled()
    const at = yield* now
    if (input.action === 'cancel') {
      if (before.actual_start) return yield* new StayStarted()
      yield* write([
        sql('UPDATE stays SET cancelled=1 WHERE id=? AND residence_id=?', id, me.residenceId),
        sql("UPDATE inspections SET status='cancelled' WHERE stay_id=? AND status='planned'", id),
        sql('UPDATE notices SET withdrawn=1 WHERE stay_id=?', id),
        auditStatement(me, at, before.lot_id, 'Séjour annulé', before, { id, cancelled: true }),
      ])
      return { ok: true }
    }
    if (!isCivilDate(input.date)) return yield* new InvalidInput({ message: 'Date invalide.' })
    if (input.date > (yield* currentDay))
      return yield* new InvalidInput({ message: 'Une réalisation ne peut pas être datée dans le futur.' })
    if (input.action === 'exit' && (!before.actual_start || input.date < before.actual_start))
      return yield* new InvalidInput({ message: 'Confirmez l’entrée avant la sortie et vérifiez les dates.' })
    if (input.action === 'entry' && before.actual_end && input.date > before.actual_end)
      return yield* new InvalidInput({ message: 'L’entrée doit précéder la sortie réelle.' })
    if (input.action === 'entry' && !before.actual_end && before.planned_end && input.date >= before.planned_end)
      return yield* new InvalidInput({
        message: 'Le départ prévu précède cette entrée : corrigez d’abord les dates du séjour.',
      })
    yield* write([
      sql(
        `UPDATE stays SET ${input.action === 'entry' ? 'actual_start' : 'actual_end'}=? WHERE id=? AND residence_id=?`,
        input.date,
        id,
        me.residenceId,
      ),
      auditStatement(
        me,
        at,
        before.lot_id,
        input.action === 'entry' ? 'Entrée réelle confirmée ou corrigée' : 'Sortie réelle confirmée ou corrigée',
        before,
        { id, ...input },
      ),
    ])
    return { ok: true }
  })

  const saveNotice = Effect.fn('Stays.saveNotice')(function* (
    me: Me,
    stayId: string,
    before: NoticeRow | null,
    input: typeof NoticeInput.Type,
  ) {
    const stay = yield* activeStay(me, stayId)
    if (
      input.received_on > (yield* currentDay) ||
      input.departure_on < input.received_on ||
      input.departure_on <= (stay.actual_start ?? stay.planned_start)
    )
      return yield* new InvalidInput({ message: 'Vérifiez la réception et le départ du préavis.' })
    const noticeId = before?.id ?? crypto.randomUUID()
    yield* write([
      before
        ? sql(
            'UPDATE notices SET received_on=?,departure_on=?,comment=? WHERE id=?',
            input.received_on,
            input.departure_on,
            input.comment,
            noticeId,
          )
        : sql(
            'INSERT INTO notices(id,residence_id,stay_id,received_on,departure_on,previous_end,comment) VALUES(?,?,?,?,?,?,?)',
            noticeId,
            me.residenceId,
            stayId,
            input.received_on,
            input.departure_on,
            stay.planned_end,
            input.comment,
          ),
      sql('UPDATE stays SET planned_end=? WHERE id=?', input.departure_on, stayId),
      auditStatement(me, yield* now, stay.lot_id, before ? 'Préavis corrigé' : 'Préavis reçu', before, {
        id: noticeId,
        ...input,
      }),
    ])
    return { ok: true }
  })

  const createNotice = Effect.fn('Stays.createNotice')(function* (stayId: string, input: typeof NoticeInput.Type) {
    return yield* saveNotice(yield* manager, stayId, null, input)
  })

  const updateNotice = Effect.fn('Stays.updateNotice')(function* (id: string, input: typeof NoticeInput.Type) {
    const me = yield* manager
    const before = yield* db.first<NoticeRow>(
      sql('SELECT * FROM notices WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!before || before.withdrawn) return yield* new NoticeNotFound()
    return yield* saveNotice(me, before.stay_id, before, input)
  })

  const withdrawNotice = Effect.fn('Stays.withdrawNotice')(function* (id: string) {
    const me = yield* manager
    const notice = yield* db.first<NoticeRow>(
      sql('SELECT * FROM notices WHERE id=? AND residence_id=? AND withdrawn=0', id, me.residenceId),
    )
    if (!notice) return yield* new NoticeNotFound()
    const stay = yield* activeStay(me, notice.stay_id)
    yield* write([
      sql('UPDATE notices SET withdrawn=1 WHERE id=?', id),
      sql('UPDATE stays SET planned_end=? WHERE id=?', notice.previous_end, notice.stay_id),
      auditStatement(me, yield* now, stay.lot_id, 'Préavis retiré', notice, { id, withdrawn: true }),
    ])
    return { ok: true }
  })

  const saveInspection = Effect.fn('Stays.saveInspection')(function* (
    me: Me,
    stayId: string,
    before: Inspection | null,
    input: typeof InspectionInput.Type,
  ) {
    const stay = yield* findStay(me, stayId)
    if (stay.cancelled) return yield* new StayCancelled()
    const instant = appointmentInstant(input.local_start)
    if (!instant)
      return yield* new InvalidInput({
        message: 'Cet horaire est inexistant ou ambigu lors du changement d’heure. Choisissez un autre horaire.',
      })
    const completed = input.status === 'done' ? (input.completed_on ?? '') : null
    if (completed !== null && !isCivilDate(completed)) return yield* new InvalidInput({ message: 'Date invalide.' })
    if (completed && completed > (yield* currentDay))
      return yield* new InvalidInput({ message: 'La réalisation ne peut pas être dans le futur.' })
    const inspectionId = before?.id ?? crypto.randomUUID()
    yield* write([
      before
        ? sql(
            'UPDATE inspections SET kind=?,starts_at=?,duration=?,status=?,completed_on=?,comment=? WHERE id=?',
            input.kind,
            instant,
            input.duration,
            input.status,
            completed,
            input.comment,
            inspectionId,
          )
        : sql(
            'INSERT INTO inspections(id,residence_id,stay_id,kind,starts_at,duration,status,completed_on,comment) VALUES(?,?,?,?,?,?,?,?,?)',
            inspectionId,
            me.residenceId,
            stayId,
            input.kind,
            instant,
            input.duration,
            input.status,
            completed,
            input.comment,
          ),
      auditStatement(me, yield* now, stay.lot_id, inspectionAction(input.status, !!before), before, {
        id: inspectionId,
        ...input,
        starts_at: instant,
      }),
    ])
    return { ok: true }
  })

  const createInspection = Effect.fn('Stays.createInspection')(function* (
    stayId: string,
    input: typeof InspectionInput.Type,
  ) {
    return yield* saveInspection(yield* manager, stayId, null, input)
  })

  const updateInspection = Effect.fn('Stays.updateInspection')(function* (
    id: string,
    input: typeof InspectionInput.Type,
  ) {
    const me = yield* manager
    const before = yield* db.first<Inspection>(
      sql('SELECT * FROM inspections WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!before) return yield* new InspectionNotFound()
    return yield* saveInspection(me, before.stay_id, before, input)
  })

  return {
    createStay,
    updateStay,
    stayAction,
    createNotice,
    updateNotice,
    withdrawNotice,
    createInspection,
    updateInspection,
  }
})

export class Stays extends Context.Service<Stays, Effect.Success<typeof make>>()('gresidence/Stays') {
  static readonly layer = Layer.effect(Stays, make)
}
