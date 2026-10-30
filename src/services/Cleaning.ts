import type { Priority } from '../domain/priority.ts'
import { Context, Effect, Layer } from 'effect'
import type { Cleanliness } from '../domain/lots.ts'
import type { IssueStatus } from '../domain/technical.ts'
import {
  CleaningAgentInvalid,
  CleaningAlreadyApproved,
  CleaningAlreadyPlanned,
  type CleaningBulk,
  CleaningCancelled,
  type CleaningChecklist,
  type CleaningComment,
  type CleaningCommentInput,
  CleaningDayTaken,
  CleaningIncomplete,
  type CleaningItem,
  type CleaningItemKind,
  CleaningItemNotFound,
  type CleaningItemState,
  CleaningLocked,
  CleaningNotDone,
  type CleaningPoint,
  type CleaningReviewFilter,
  type CleaningReviewInput,
  type CleaningStatusInput,
  type CleaningSupply,
  type CleaningTask,
  type CleaningTaskCreate,
  type CleaningTaskDetail,
  type CleaningType,
  CleaningTaskNotFound,
  type CleaningTemplate,
  type CleaningTemplateInput,
  CleaningTemplateNameTaken,
  CleaningTemplateNotFound,
  MAX_CREATED,
  MAX_PERIOD_DAYS,
  MAX_REPEAT_DAYS,
  PAGE_SIZE,
  READINESS_LIMIT,
  type ReadinessLot,
  repeatDays,
  REVIEW_LIMIT,
  templateFor,
} from '../domain/cleaning.ts'
import { currentDay, now, stamp } from '../domain/clock.ts'
import { addDays } from '../domain/rules.ts'
import { CurrentUser, manager } from '../domain/CurrentUser.ts'
import { InvalidInput } from '../domain/errors.ts'
import type { Me, Role } from '../domain/accounts.ts'
import { onViolation, sql, Sql, type SqlError, type Statement } from './Database.ts'

const occupiedLot = `EXISTS(SELECT 1 FROM stays s WHERE s.lot_id=l.id AND s.cancelled=0 AND s.actual_start IS NOT NULL AND s.actual_end IS NULL)`
const taskColumns = `t.id,t.type,t.lot_id,COALESCE(l.number,'') AS lot_number,t.place_id,COALESCE(p.name,'') AS place_name,
  COALESCE(b.name,'') AS building_name,
  CASE WHEN l.cleanliness<>'out_of_service' AND ${occupiedLot} THEN NULL ELSE l.cleanliness END AS cleanliness,
  (t.lot_id IS NOT NULL AND EXISTS(SELECT 1 FROM stays s WHERE s.lot_id=t.lot_id AND s.cancelled=0
    AND COALESCE(s.actual_start,s.planned_start)=t.day)) AS arrival,t.agent_id,a.name AS agent_name,
  t.day,t.status,t.priority,t.template_name,t.note,t.report,t.completed_at,c.name AS completed_by,t.position,
  t.review,t.reviewed_at,r.name AS reviewed_by,
  (SELECT COUNT(*) FROM cleaning_task_comments m WHERE m.task_id=t.id) AS comments,
  (SELECT COUNT(*) FROM cleaning_task_items i WHERE i.task_id=t.id) AS total,
  (SELECT COUNT(*) FROM cleaning_task_items i WHERE i.task_id=t.id AND i.state<>'todo') AS handled,
  (SELECT COUNT(*) FROM cleaning_task_items i WHERE i.task_id=t.id AND i.state='issue') AS issues,
  (SELECT json_group_array(label || ' : ' || note) FROM (SELECT i.label,i.note FROM cleaning_task_items i
    WHERE i.task_id=t.id AND i.state='issue' AND i.note<>'' ORDER BY i.position,i.rowid)) AS remarks
  FROM cleaning_tasks t LEFT JOIN lots l ON l.id=t.lot_id LEFT JOIN places p ON p.id=t.place_id JOIN users a ON a.id=t.agent_id
  LEFT JOIN buildings b ON b.id=COALESCE(l.building_id,p.building_id) AND b.residence_id=t.residence_id
  LEFT JOIN users c ON c.id=t.completed_by LEFT JOIN users r ON r.id=t.reviewed_by`
const targetOrder = `COALESCE(l.number,p.name) COLLATE NOCASE`
type TaskRow = Omit<CleaningTask, 'remarks' | 'arrival'> & { remarks: string; arrival: number }
const taskOf = (row: TaskRow): CleaningTask => ({
  ...row,
  arrival: row.arrival === 1,
  remarks: JSON.parse(row.remarks) as string[],
})
const itemColumns = `i.id,i.task_id,i.kind,i.label,i.state,i.note,u.name AS updated_by,i.updated_at,
  s.id AS issue_id,s.status AS issue_status FROM cleaning_task_items i LEFT JOIN users u ON u.id=i.updated_by
  LEFT JOIN issues s ON s.cleaning_item_id=i.id AND s.residence_id=i.residence_id`
const commentColumns = `m.id,m.task_id,m.kind,m.body,u.name AS author,m.created_at FROM cleaning_task_comments m
  JOIN users u ON u.id=m.author_id`
const shortDate = (day: string) => day.slice(8, 10) + '/' + day.slice(5, 7)
const ofTask = <A extends { task_id: string }>(rows: readonly A[], id: string) =>
  rows.filter((row) => row.task_id === id)
const visible = (me: Me) =>
  me.role === 'cleaner' ? { clause: ' AND t.agent_id=?', values: [me.id] } : { clause: '', values: [] }

const reviewClauses: Record<CleaningReviewFilter, string> = {
  pending: " AND t.status='done' AND t.review IS NULL",
  approved: " AND t.review='approved'",
  revision: " AND t.status='planned' AND t.review='revision'",
}

const placeholders = (values: readonly unknown[]) => values.map(() => '?').join(',')
const insertItems = (me: Me, taskId: string, items: readonly CleaningPoint[], start = 0) =>
  items.map((item, index) =>
    sql(
      'INSERT INTO cleaning_task_items(id,residence_id,task_id,kind,label,position) VALUES(?,?,?,?,?,?)',
      crypto.randomUUID(),
      me.residenceId,
      taskId,
      item.kind,
      item.label,
      start + index,
    ),
  )

const insertComment = (
  me: Me,
  taskId: string,
  kind: CleaningComment['kind'],
  body: string,
  at: string,
  id: string = crypto.randomUUID(),
) =>
  sql(
    'INSERT INTO cleaning_task_comments(id,residence_id,task_id,kind,body,author_id,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    id,
    me.residenceId,
    taskId,
    kind,
    body,
    me.id,
    at,
  )

const planned = (task: CleaningTask) => (task.status === 'planned' ? Effect.void : Effect.fail(new CleaningLocked()))

const violations = <A, E, R>(self: Effect.Effect<A, E | SqlError, R>) =>
  self.pipe(
    onViolation('UNIQUE constraint failed: cleaning_templates.', () => new CleaningTemplateNameTaken()),
    onViolation('UNIQUE constraint failed: cleaning_tasks.', () => new CleaningDayTaken()),
    onViolation('cleaning_agent', () => new CleaningAgentInvalid()),
    onViolation('cleaning_incomplete', () => new CleaningIncomplete()),
    onViolation('cleaning_locked', () => new CleaningLocked()),
    onViolation('cleaning_cancelled', () => new CleaningCancelled()),
    onViolation('cleaning_not_done', () => new CleaningNotDone()),
    onViolation(
      'lot_unavailable',
      () => new InvalidInput({ message: 'Un des lots choisis est archivé ou introuvable. Rechargez la page.' }),
    ),
    onViolation(
      'place_unavailable',
      () => new InvalidInput({ message: 'Un des lieux choisis est archivé ou introuvable. Rechargez la page.' }),
    ),
    onViolation(
      'UNIQUE constraint failed: issues.cleaning_item_id',
      () => new InvalidInput({ message: 'Un signalement existe déjà pour ce point. Rechargez la page.' }),
    ),
  )

const make = Effect.gen(function* () {
  const db = yield* Sql
  const write = (statements: Statement[]) => violations(db.batch(statements))

  const loadTemplates = Effect.fn('Cleaning.loadTemplates')(function* (me: Me) {
    const [rows, items, links] = yield* Effect.all([
      db.all<{ id: string; name: string; is_default: number; default_type: CleaningType | null }>(
        sql(
          'SELECT id,name,is_default,default_type FROM cleaning_templates WHERE residence_id=? ORDER BY is_default DESC,name COLLATE NOCASE',
          me.residenceId,
        ),
      ),
      db.all<CleaningPoint & { template_id: string }>(
        sql(
          'SELECT template_id,kind,label FROM cleaning_template_items WHERE residence_id=? ORDER BY template_id,position',
          me.residenceId,
        ),
      ),
      db.all<{ template_id: string; lot_id: string }>(
        sql('SELECT template_id,lot_id FROM cleaning_lot_templates WHERE residence_id=?', me.residenceId),
      ),
    ])
    return rows.map((row): CleaningTemplate => ({
      id: row.id,
      name: row.name,
      is_default: row.is_default === 1,
      default_type: row.default_type,
      items: items
        .filter((item) => item.template_id === row.id)
        .map((item) => ({ kind: item.kind, label: item.label })),
      lot_ids: links.filter((link) => link.template_id === row.id).map((link) => link.lot_id),
    }))
  })
  const findTask = Effect.fn('Cleaning.findTask')(function* (id: string) {
    const me = yield* CurrentUser
    const scope = visible(me)
    const task = yield* db.first<TaskRow>(
      sql(
        `SELECT ${taskColumns} WHERE t.id=? AND t.residence_id=?${scope.clause}`,
        id,
        me.residenceId,
        ...scope.values,
      ),
    )
    if (!task) return yield* new CleaningTaskNotFound()
    return taskOf(task)
  })
  const findItem = Effect.fn('Cleaning.findItem')(function* (id: string) {
    const me = yield* CurrentUser
    const row = yield* db.first<{ task_id: string }>(
      sql('SELECT task_id FROM cleaning_task_items WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!row) return yield* new CleaningItemNotFound()
    return yield* findTask(row.task_id)
  })
  const writeTemplate = Effect.fn('Cleaning.writeTemplate')(function* (
    me: Me,
    id: string,
    input: typeof CleaningTemplateInput.Type,
    created: boolean,
  ) {
    const lots = [...new Set(input.lot_ids)]
    yield* write([
      created
        ? sql('INSERT INTO cleaning_templates(id,residence_id,name) VALUES(?,?,?)', id, me.residenceId, input.name)
        : sql('UPDATE cleaning_templates SET name=? WHERE id=? AND residence_id=?', input.name, id, me.residenceId),
      input.is_default
        ? sql('UPDATE cleaning_templates SET is_default=0 WHERE residence_id=? AND id<>?', me.residenceId, id)
        : sql('UPDATE cleaning_templates SET is_default=0 WHERE id=? AND residence_id=?', id, me.residenceId),
      ...(input.is_default
        ? [sql('UPDATE cleaning_templates SET is_default=1 WHERE id=? AND residence_id=?', id, me.residenceId)]
        : []),
      ...(input.default_type === undefined
        ? []
        : [
            sql(
              'UPDATE cleaning_templates SET default_type=NULL WHERE residence_id=? AND (id=? OR default_type=?)',
              me.residenceId,
              id,
              input.default_type,
            ),
            ...(input.default_type
              ? [
                  sql(
                    'UPDATE cleaning_templates SET default_type=? WHERE id=? AND residence_id=?',
                    input.default_type,
                    id,
                    me.residenceId,
                  ),
                ]
              : []),
          ]),
      sql('DELETE FROM cleaning_template_items WHERE template_id=? AND residence_id=?', id, me.residenceId),
      ...input.items.map((item, index) =>
        sql(
          'INSERT INTO cleaning_template_items(id,residence_id,template_id,kind,label,position) VALUES(?,?,?,?,?,?)',
          crypto.randomUUID(),
          me.residenceId,
          id,
          item.kind,
          item.label,
          index,
        ),
      ),
      sql('DELETE FROM cleaning_lot_templates WHERE template_id=? AND residence_id=?', id, me.residenceId),
      ...lots.map((lot) =>
        sql(
          'INSERT OR REPLACE INTO cleaning_lot_templates(lot_id,residence_id,template_id) VALUES(?,?,?)',
          lot,
          me.residenceId,
          id,
        ),
      ),
    ])
    return { id }
  })

  const options = Effect.fn('Cleaning.options')(function* () {
    const me = yield* manager
    const [lots, places, agents, templates] = yield* Effect.all([
      db.all<{
        id: string
        number: string
        building_name: string
        template_id: string | null
        cleanliness: Cleanliness
        occupied: number
      }>(
        sql(
          `SELECT l.id,l.number,COALESCE(b.name,'') AS building_name,(SELECT template_id FROM cleaning_lot_templates WHERE lot_id=l.id) AS template_id,
          l.cleanliness,${occupiedLot} AS occupied FROM lots l LEFT JOIN buildings b ON b.id=l.building_id AND b.residence_id=l.residence_id
          WHERE l.residence_id=? AND l.archived=0 ORDER BY l.number COLLATE NOCASE`,
          me.residenceId,
        ),
      ),
      db.all<{ id: string; name: string; building_name: string }>(
        sql(
          `SELECT p.id,p.name,COALESCE(b.name,'') AS building_name FROM places p
          LEFT JOIN buildings b ON b.id=p.building_id AND b.residence_id=p.residence_id
          WHERE p.residence_id=? AND p.archived=0 ORDER BY p.name COLLATE NOCASE`,
          me.residenceId,
        ),
      ),
      db.all<{ id: string; name: string; role: Role }>(
        sql(
          `SELECT id,name,role FROM users WHERE residence_id=? AND disabled=0 ORDER BY role<>'cleaner',name COLLATE NOCASE`,
          me.residenceId,
        ),
      ),
      loadTemplates(me),
    ])
    return { lots: lots.map((lot) => ({ ...lot, occupied: lot.occupied === 1 })), places, agents, templates }
  })

  const templates = Effect.fn('Cleaning.templates')(function* () {
    return yield* loadTemplates(yield* manager)
  })

  const createTemplate = Effect.fn('Cleaning.createTemplate')(function* (input: typeof CleaningTemplateInput.Type) {
    return yield* writeTemplate(yield* manager, crypto.randomUUID(), input, true)
  })

  const updateTemplate = Effect.fn('Cleaning.updateTemplate')(function* (
    id: string,
    input: typeof CleaningTemplateInput.Type,
  ) {
    const me = yield* manager
    const row = yield* db.first(
      sql('SELECT id FROM cleaning_templates WHERE id=? AND residence_id=?', id, me.residenceId),
    )
    if (!row) return yield* new CleaningTemplateNotFound()
    return yield* writeTemplate(me, id, input, false)
  })

  const removeTemplate = Effect.fn('Cleaning.removeTemplate')(function* (id: string) {
    const me = yield* manager
    yield* write([
      sql('DELETE FROM cleaning_lot_templates WHERE template_id=? AND residence_id=?', id, me.residenceId),
      sql('DELETE FROM cleaning_template_items WHERE template_id=? AND residence_id=?', id, me.residenceId),
      sql('DELETE FROM cleaning_templates WHERE id=? AND residence_id=?', id, me.residenceId),
    ])
    return { ok: true }
  })

  const tasks = Effect.fn('Cleaning.tasks')(function* (input: {
    from: string
    to: string
    agent?: string
    priority?: Priority
    review?: CleaningReviewFilter
  }) {
    const me = yield* CurrentUser
    if (input.to < input.from || Date.parse(input.to) - Date.parse(input.from) > MAX_PERIOD_DAYS * 86400000)
      return yield* new InvalidInput({ message: 'Période invalide : six semaines au maximum.' })
    const scope = visible(me)
    const agent = me.role === 'cleaner' ? '' : (input.agent ?? '')
    const rows = yield* db.all<TaskRow>(
      sql(
        `SELECT ${taskColumns} WHERE t.residence_id=? AND t.day BETWEEN ? AND ? AND (?='' OR t.agent_id=?) AND (?='' OR t.priority=?)${scope.clause}${input.review ? reviewClauses[input.review] : ''}
        ORDER BY t.day DESC,CASE t.status WHEN 'planned' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,t.position IS NULL,t.position,
          arrival DESC,CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,${targetOrder},t.id`,
        me.residenceId,
        input.from,
        input.to,
        agent,
        agent,
        input.priority ?? '',
        input.priority ?? '',
        ...scope.values,
      ),
    )
    return rows.map(taskOf)
  })

  const reviews = Effect.fn('Cleaning.reviews')(function* () {
    const me = yield* manager
    const rows = yield* db.all<TaskRow>(
      sql(
        `SELECT ${taskColumns} WHERE t.residence_id=?${reviewClauses.pending}
        ORDER BY t.completed_at DESC,t.id LIMIT ?`,
        me.residenceId,
        REVIEW_LIMIT,
      ),
    )
    return rows.map(taskOf)
  })

  const lotTasks = Effect.fn('Cleaning.lotTasks')(function* (lotId: string, page = 1) {
    const me = yield* CurrentUser
    const scope = visible(me)
    const [rows, count] = yield* Effect.all([
      db.all<TaskRow>(
        sql(
          `SELECT ${taskColumns} WHERE t.lot_id=? AND t.residence_id=?${scope.clause}
          ORDER BY t.day DESC,t.created_at DESC,t.id LIMIT ? OFFSET ?`,
          lotId,
          me.residenceId,
          ...scope.values,
          PAGE_SIZE,
          (page - 1) * PAGE_SIZE,
        ),
      ),
      db.first<{ total: number }>(
        sql(
          `SELECT COUNT(*) AS total FROM cleaning_tasks t WHERE t.lot_id=? AND t.residence_id=?${scope.clause}`,
          lotId,
          me.residenceId,
          ...scope.values,
        ),
      ),
    ])
    return { items: rows.map(taskOf), total: count?.total ?? 0 }
  })

  const details = Effect.fn('Cleaning.details')(function* (me: Me, found: readonly CleaningTask[]) {
    if (!found.length) return []
    const ids = found.map((row) => row.id)
    const [items, comments, supplies] = yield* Effect.all([
      db.all<CleaningItem & { task_id: string }>(
        sql(
          `SELECT ${itemColumns} WHERE i.residence_id=? AND i.task_id IN (${placeholders(ids)}) ORDER BY i.position,i.rowid`,
          me.residenceId,
          ...ids,
        ),
      ),
      db.all<CleaningComment & { task_id: string }>(
        sql(
          `SELECT ${commentColumns} WHERE m.residence_id=? AND m.task_id IN (${placeholders(ids)}) ORDER BY m.created_at,m.rowid`,
          me.residenceId,
          ...ids,
        ),
      ),
      me.role === 'cleaner'
        ? Effect.succeed([])
        : db.all<CleaningSupply & { task_id: string }>(
            sql(
              `SELECT m.id,m.cleaning_task_id AS task_id,m.item_id,s.name AS item_name,s.unit,-m.delta AS quantity,m.occurred_on,
              m.comment,u.name AS actor FROM stock_movements m JOIN stock_items s ON s.id=m.item_id JOIN users u ON u.id=m.actor_id
              WHERE m.residence_id=? AND m.cleaning_task_id IN (${placeholders(ids)}) ORDER BY m.created_at,m.rowid`,
              me.residenceId,
              ...ids,
            ),
          ),
    ])
    return found.map((row): CleaningTaskDetail => ({
      task: row,
      items: ofTask(items, row.id).map((item) => ({
        ...item,
        issue_status: item.issue_status as IssueStatus | null,
      })),
      comments: ofTask(comments, row.id),
      supplies: ofTask(supplies, row.id),
    }))
  })

  const task = Effect.fn('Cleaning.task')(function* (id: string) {
    const me = yield* CurrentUser
    const [detail] = yield* details(me, [yield* findTask(id)])
    return detail!
  })

  const agentDay = Effect.fn('Cleaning.agentDay')(function* (date: string) {
    const me = yield* CurrentUser
    const rows = yield* db.all<TaskRow>(
      sql(
        `SELECT ${taskColumns} WHERE t.residence_id=? AND t.agent_id=? AND t.day=? AND t.status<>'cancelled'
        ORDER BY t.status<>'planned',t.position IS NULL,t.position,arrival DESC,
          CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,${targetOrder},t.id`,
        me.residenceId,
        me.id,
        date,
      ),
    )
    return { day: date, tasks: yield* details(me, rows.map(taskOf)) }
  })

  const create = Effect.fn('Cleaning.create')(function* (input: typeof CleaningTaskCreate.Type) {
    const me = yield* manager
    const lots = [...new Set(input.lot_ids)],
      places = [...new Set(input.place_ids ?? [])]
    if (!lots.length && !places.length)
      return yield* new InvalidInput({ message: 'Choisissez au moins un lot ou un lieu.' })
    if (input.repeat && (input.repeat.until < input.day || input.repeat.until > addDays(input.day, MAX_REPEAT_DAYS)))
      return yield* new InvalidInput({
        message: 'La répétition se termine après le premier jour et dans les trois mois.',
      })
    const days = repeatDays(input.day, input.repeat)
    if (!days.length) return yield* new InvalidInput({ message: 'Aucun jour ne correspond à la répétition choisie.' })
    if ((lots.length + places.length) * days.length > MAX_CREATED)
      return yield* new InvalidInput({ message: `Trop de ménages en une fois : ${MAX_CREATED} au maximum.` })
    const all = yield* loadTemplates(me)
    const explicit = input.template_id && input.template_id !== 'none'
    if (explicit && !all.some((template) => template.id === input.template_id))
      return yield* new CleaningTemplateNotFound()
    const [taken, labels] = yield* Effect.all([
      db.all<{ lot_id: string | null; place_id: string | null; day: string }>(
        sql(
          `SELECT lot_id,place_id,day FROM cleaning_tasks WHERE residence_id=? AND status<>'cancelled' AND day BETWEEN ? AND ?`,
          me.residenceId,
          days[0]!,
          days[days.length - 1]!,
        ),
      ),
      db.all<{ id: string; label: string }>(
        sql(
          `SELECT id,number AS label FROM lots WHERE residence_id=? UNION ALL SELECT id,name AS label FROM places WHERE residence_id=?`,
          me.residenceId,
          me.residenceId,
        ),
      ),
    ])
    const targets = [
      ...lots.map((id) => ({ lot: id as string | null, place: null as string | null, id })),
      ...places.map((id) => ({ lot: null as string | null, place: id as string | null, id })),
    ].flatMap((target) => days.map((date) => ({ ...target, day: date })))
    const isTaken = (target: (typeof targets)[number]) =>
      taken.some((row) => row.day === target.day && (row.lot_id ?? row.place_id) === target.id)
    const free = targets.filter((target) => !isTaken(target))
    const skipped = targets
      .filter(isTaken)
      .map((target) => {
        const label = labels.find((row) => row.id === target.id)?.label ?? ''
        return input.repeat ? label + ' le ' + shortDate(target.day) : label
      })
      .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
    if (!free.length) return yield* new CleaningDayTaken()
    const createdAt = yield* now
    yield* write(
      free.flatMap((target) => {
        const type = input.type ?? (target.place ? 'commons' : 'routine')
        const template =
          input.template_id === 'none'
            ? undefined
            : explicit
              ? all.find((item) => item.id === input.template_id)
              : templateFor(all, type, target.lot)
        const id = crypto.randomUUID()
        return [
          sql(
            `INSERT INTO cleaning_tasks(id,residence_id,lot_id,place_id,type,agent_id,day,template_name,note,priority,created_by,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            id,
            me.residenceId,
            target.lot,
            target.place,
            type,
            input.agent_id,
            target.day,
            template?.name ?? '',
            input.note,
            input.priority ?? 'normal',
            me.id,
            createdAt,
          ),
          ...insertItems(me, id, [...(template?.items ?? []), ...(input.items ?? [])]),
        ]
      }),
    )
    return { created: free.length, skipped }
  })

  const movements = Effect.fn('Cleaning.movements')(function* (day: string) {
    const me = yield* manager
    const lotsWhere = (column: string) =>
      db.all<{ lot_id: string }>(
        sql(
          `SELECT DISTINCT s.lot_id FROM stays s JOIN lots l ON l.id=s.lot_id
          WHERE s.residence_id=? AND s.cancelled=0 AND l.archived=0 AND ${column}=?`,
          me.residenceId,
          day,
        ),
      )
    const [departures, arrivals] = yield* Effect.all([
      lotsWhere('COALESCE(s.actual_end,s.planned_end)'),
      lotsWhere('COALESCE(s.actual_start,s.planned_start)'),
    ])
    return { departures: departures.map((row) => row.lot_id), arrivals: arrivals.map((row) => row.lot_id) }
  })

  const update = Effect.fn('Cleaning.update')(function* (
    id: string,
    input: { agent_id: string; day: string; note: string; priority?: Priority; type?: CleaningType },
  ) {
    const me = yield* manager
    const before = yield* findTask(id)
    yield* planned(before)
    yield* write([
      sql(
        'UPDATE cleaning_tasks SET agent_id=?,day=?,position=CASE WHEN day=? THEN position END,note=?,priority=?,type=? WHERE id=? AND residence_id=?',
        input.agent_id,
        input.day,
        input.day,
        input.note,
        input.priority ?? before.priority,
        input.type ?? before.type,
        id,
        me.residenceId,
      ),
    ])
    return { ok: true }
  })

  const bulk = Effect.fn('Cleaning.bulk')(function* (input: typeof CleaningBulk.Type) {
    const me = yield* manager
    const ids = [...new Set(input.task_ids)]
    const items = input.items ?? []
    const changes = input.agent_id !== undefined || input.day !== undefined || input.priority !== undefined
    if (!input.cancel && !changes && !items.length)
      return yield* new InvalidInput({ message: 'Choisissez une modification à appliquer.' })
    const found = yield* Effect.forEach(ids, findTask)
    const targets = found.filter((row) => row.status === 'planned').map((row) => row.id)
    if (!targets.length) return yield* new CleaningLocked()
    const next = items.length
      ? yield* db.all<{ task_id: string; next: number }>(
          sql(
            `SELECT task_id,MAX(position)+1 AS next FROM cleaning_task_items
            WHERE residence_id=? AND task_id IN (${placeholders(targets)}) GROUP BY task_id`,
            me.residenceId,
            ...targets,
          ),
        )
      : []
    const day = input.day ?? null
    yield* write(
      targets.flatMap((id) =>
        input.cancel
          ? [
              sql(
                `UPDATE cleaning_tasks SET status='cancelled' WHERE id=? AND residence_id=? AND status='planned'`,
                id,
                me.residenceId,
              ),
            ]
          : [
              ...(changes
                ? [
                    sql(
                      `UPDATE cleaning_tasks SET agent_id=COALESCE(?,agent_id),day=COALESCE(?,day),
                      position=CASE WHEN ? IS NULL OR ?=day THEN position END,priority=COALESCE(?,priority)
                      WHERE id=? AND residence_id=? AND status='planned'`,
                      input.agent_id ?? null,
                      day,
                      day,
                      day,
                      input.priority ?? null,
                      id,
                      me.residenceId,
                    ),
                  ]
                : []),
              ...insertItems(me, id, items, next.find((row) => row.task_id === id)?.next ?? 0),
            ],
      ),
    )
    return { updated: targets.length, skipped: ids.length - targets.length }
  })

  const order = Effect.fn('Cleaning.order')(function* (input: {
    readonly task_ids: readonly string[]
    readonly day: string
  }) {
    const me = yield* manager
    const ids = [...new Set(input.task_ids)]
    for (const id of ids) {
      const found = yield* findTask(id)
      yield* planned(found)
      if (found.day !== input.day)
        return yield* new InvalidInput({
          message: 'Ces ménages ne sont plus tous prévus ce jour-là. Rechargez la page.',
        })
    }
    yield* write(
      ids.map((id, index) =>
        sql('UPDATE cleaning_tasks SET position=? WHERE id=? AND residence_id=?', index, id, me.residenceId),
      ),
    )
    return { ok: true }
  })

  const setStatus = Effect.fn('Cleaning.setStatus')(function* (id: string, input: typeof CleaningStatusInput.Type) {
    const me = yield* CurrentUser
    const found = yield* findTask(id)
    if (input.status === 'done') {
      yield* planned(found)
      yield* write([
        sql(
          `UPDATE cleaning_tasks SET status='done',report=?,completed_at=?,completed_by=?,review=NULL,reviewed_at=NULL,reviewed_by=NULL
          WHERE id=? AND residence_id=? AND status='planned'`,
          input.report,
          yield* stamp(input.at),
          me.id,
          id,
          me.residenceId,
        ),
      ])
      return { ok: true }
    }
    yield* manager
    if (input.status === 'cancelled') yield* planned(found)
    else if (found.status === 'planned') return yield* new CleaningAlreadyPlanned()
    yield* write([
      sql(
        `UPDATE cleaning_tasks SET status=?,completed_at=NULL,completed_by=NULL,review=NULL,reviewed_at=NULL,reviewed_by=NULL
        WHERE id=? AND residence_id=?`,
        input.status,
        id,
        me.residenceId,
      ),
    ])
    return { ok: true }
  })

  const comment = Effect.fn('Cleaning.comment')(function* (taskId: string, input: typeof CleaningCommentInput.Type) {
    const me = yield* CurrentUser
    const found = yield* findTask(taskId)
    if (found.status === 'cancelled') return yield* new CleaningCancelled()
    yield* write([insertComment(me, taskId, 'note', input.body, yield* stamp(input.at), input.id)])
    return { ok: true }
  })

  const review = Effect.fn('Cleaning.review')(function* (taskId: string, input: typeof CleaningReviewInput.Type) {
    const me = yield* manager
    const found = yield* findTask(taskId)
    if (found.status !== 'done') return yield* new CleaningNotDone()
    if (found.review === 'approved') return yield* new CleaningAlreadyApproved()
    const at = yield* now
    if (input.decision === 'approved') {
      yield* write([
        sql(
          `UPDATE cleaning_tasks SET review='approved',reviewed_at=?,reviewed_by=? WHERE id=? AND residence_id=? AND status='done'`,
          at,
          me.id,
          taskId,
          me.residenceId,
        ),
        insertComment(me, taskId, 'approved', input.comment, at),
      ])
      return { ok: true }
    }
    if (!input.comment) return yield* new InvalidInput({ message: 'Précisez ce qu’il faut reprendre.' })
    const redo = [...new Set(input.item_ids ?? [])]
    if (redo.length) {
      const known = yield* db.all<{ id: string }>(
        sql(
          `SELECT id FROM cleaning_task_items WHERE task_id=? AND residence_id=? AND id IN (${placeholders(redo)})`,
          taskId,
          me.residenceId,
          ...redo,
        ),
      )
      if (known.length !== redo.length) return yield* new CleaningItemNotFound()
    }
    const day = input.day && input.day !== found.day ? input.day : null
    yield* write([
      sql(
        `UPDATE cleaning_tasks SET status='planned',completed_at=NULL,completed_by=NULL,review='revision',reviewed_at=?,reviewed_by=?
        WHERE id=? AND residence_id=? AND status='done'`,
        at,
        me.id,
        taskId,
        me.residenceId,
      ),
      ...(day
        ? [
            sql(
              'UPDATE cleaning_tasks SET day=?,position=NULL WHERE id=? AND residence_id=?',
              day,
              taskId,
              me.residenceId,
            ),
          ]
        : []),
      ...(redo.length
        ? [
            sql(
              `UPDATE cleaning_task_items SET state='todo',note='',updated_by=NULL,updated_at=NULL
              WHERE task_id=? AND residence_id=? AND id IN (${placeholders(redo)})`,
              taskId,
              me.residenceId,
              ...redo,
            ),
          ]
        : []),
      insertComment(me, taskId, 'revision', input.comment, at),
    ])
    return { ok: true }
  })

  const updateItem = Effect.fn('Cleaning.updateItem')(function* (
    itemId: string,
    input: { state: CleaningItemState; note: string; at?: string },
  ) {
    const me = yield* CurrentUser
    yield* planned(yield* findItem(itemId))
    yield* write([
      sql(
        'UPDATE cleaning_task_items SET state=?,note=?,updated_by=?,updated_at=? WHERE id=? AND residence_id=?',
        input.state,
        input.state === 'issue' ? input.note : '',
        me.id,
        yield* stamp(input.at),
        itemId,
        me.residenceId,
      ),
    ])
    return { ok: true }
  })

  const checkAll = Effect.fn('Cleaning.checkAll')(function* (taskId: string, kind: CleaningItemKind, at?: string) {
    const me = yield* CurrentUser
    yield* planned(yield* findTask(taskId))
    yield* write([
      sql(
        `UPDATE cleaning_task_items SET state='done',note='',updated_by=?,updated_at=?
        WHERE task_id=? AND residence_id=? AND kind=? AND state='todo'`,
        me.id,
        yield* stamp(at),
        taskId,
        me.residenceId,
        kind,
      ),
    ])
    return { ok: true }
  })

  const checklist = Effect.fn('Cleaning.checklist')(function* (taskId: string, input: typeof CleaningChecklist.Type) {
    const me = yield* manager
    yield* planned(yield* findTask(taskId))
    const current = yield* db.all<{ id: string }>(
      sql('SELECT id FROM cleaning_task_items WHERE task_id=? AND residence_id=?', taskId, me.residenceId),
    )
    const kept = input.items.flatMap((item) => (item.id ? [item.id] : []))
    if (new Set(kept).size !== kept.length || kept.some((id) => !current.some((row) => row.id === id)))
      return yield* new CleaningItemNotFound()
    yield* write([
      ...current
        .filter((row) => !kept.includes(row.id))
        .map((row) => sql('DELETE FROM cleaning_task_items WHERE id=? AND residence_id=?', row.id, me.residenceId)),
      ...input.items.flatMap((item, index) =>
        item.id
          ? [
              sql(
                `UPDATE cleaning_task_items SET label=?,position=?,
                state=CASE WHEN kind=? THEN state ELSE 'todo' END,note=CASE WHEN kind=? THEN note ELSE '' END,
                updated_by=CASE WHEN kind=? THEN updated_by END,updated_at=CASE WHEN kind=? THEN updated_at END,kind=?
                WHERE id=? AND residence_id=?`,
                item.label,
                index,
                item.kind,
                item.kind,
                item.kind,
                item.kind,
                item.kind,
                item.id,
                me.residenceId,
              ),
            ]
          : insertItems(me, taskId, [item], index),
      ),
    ])
    return { ok: true }
  })

  const readiness = Effect.fn('Cleaning.readiness')(function* (date: string) {
    const me = yield* manager
    const columns = `l.id AS lot_id,l.number,COALESCE(b.name,'') AS building_name,l.cleanliness,l.cleanliness_at,
      (SELECT json_object('id',t.id,'day',t.day,'status',t.status,'review',t.review,'agent_name',a.name)
        FROM cleaning_tasks t JOIN users a ON a.id=t.agent_id WHERE t.lot_id=l.id AND t.status<>'cancelled'
        ORDER BY t.status<>'planned',CASE WHEN t.status='planned' THEN t.day END,t.day DESC LIMIT 1) AS task`
    const lotJoins = `LEFT JOIN buildings b ON b.id=l.building_id AND b.residence_id=l.residence_id`
    type Row = Omit<ReadinessLot, 'task'> & { task: string | null }
    const of = (row: Row): ReadinessLot => ({
      ...row,
      task: row.task ? (JSON.parse(row.task) as ReadinessLot['task']) : null,
    })
    const [arrivals, prepare, counts] = yield* Effect.all([
      db.all<Row>(
        sql(
          `SELECT ${columns},s.planned_start AS arrival FROM stays s JOIN lots l ON l.id=s.lot_id ${lotJoins}
          WHERE s.residence_id=? AND s.cancelled=0 AND s.actual_start IS NULL AND l.archived=0 AND s.planned_start BETWEEN ? AND ?
          ORDER BY s.planned_start,l.number COLLATE NOCASE,s.id LIMIT ?`,
          me.residenceId,
          date,
          addDays(date, 1),
          READINESS_LIMIT,
        ),
      ),
      db.all<Row>(
        sql(
          `SELECT ${columns},(SELECT MIN(s.planned_start) FROM stays s WHERE s.lot_id=l.id AND s.cancelled=0
            AND s.actual_start IS NULL AND s.planned_start>=?) AS arrival FROM lots l ${lotJoins}
          WHERE l.residence_id=? AND l.archived=0 AND l.cleanliness='dirty'
            AND NOT EXISTS(SELECT 1 FROM stays s WHERE s.lot_id=l.id AND s.cancelled=0 AND s.actual_start IS NOT NULL AND s.actual_end IS NULL)
          ORDER BY arrival IS NULL,arrival,l.cleanliness_at,l.number COLLATE NOCASE LIMIT ?`,
          date,
          me.residenceId,
          READINESS_LIMIT,
        ),
      ),
      db.all<{ cleanliness: Cleanliness; total: number }>(
        sql(
          `SELECT l.cleanliness,COUNT(*) AS total FROM lots l WHERE l.residence_id=? AND l.archived=0
          AND (l.cleanliness='out_of_service' OR NOT ${occupiedLot}) GROUP BY l.cleanliness`,
          me.residenceId,
        ),
      ),
    ])
    const count = (state: Cleanliness) => counts.find((row) => row.cleanliness === state)?.total ?? 0
    return {
      day: date,
      arrivals: arrivals.map(of),
      to_prepare: prepare.map(of),
      counts: {
        dirty: count('dirty'),
        clean: count('clean'),
        inspected: count('inspected'),
        out_of_service: count('out_of_service'),
      },
    }
  })

  const setCleanliness = Effect.fn('Cleaning.setCleanliness')(function* (lotId: string, cleanliness: Cleanliness) {
    const me = yield* manager
    const lot = yield* db.first(
      sql('SELECT id FROM lots WHERE id=? AND residence_id=? AND archived=0', lotId, me.residenceId),
    )
    if (!lot) return yield* new InvalidInput({ message: 'Lot archivé ou introuvable. Rechargez la page.' })
    yield* write([
      sql(
        'UPDATE lots SET cleanliness=?,cleanliness_at=? WHERE id=? AND residence_id=?',
        cleanliness,
        yield* now,
        lotId,
        me.residenceId,
      ),
    ])
    return { ok: true }
  })

  const createIssue = Effect.fn('Cleaning.createIssue')(function* (itemId: string) {
    const me = yield* manager
    const found = yield* findItem(itemId)
    if (found.status === 'cancelled') return yield* new CleaningCancelled()
    const item = yield* db.first<{ label: string; note: string; state: CleaningItemState; issue_id: string | null }>(
      sql(
        `SELECT i.label,i.note,i.state,s.id AS issue_id FROM cleaning_task_items i
        LEFT JOIN issues s ON s.cleaning_item_id=i.id WHERE i.id=? AND i.residence_id=?`,
        itemId,
        me.residenceId,
      ),
    )
    if (!item) return yield* new CleaningItemNotFound()
    if (item.issue_id) return { id: item.issue_id }
    if (item.state !== 'issue')
      return yield* new InvalidInput({ message: 'Seul un point signalé peut devenir un signalement technique.' })
    const issueId = crypto.randomUUID(),
      at = yield* now
    const reported = (yield* currentDay) < found.day ? yield* currentDay : found.day
    const description = [item.note, `Ménage du ${shortDate(found.day)} · ${found.agent_name}`]
      .filter(Boolean)
      .join('\n')
    yield* write([
      sql(
        `INSERT INTO issues(id,residence_id,title,description,reported_on,lot_id,place_id,priority,created_by,created_at,cleaning_item_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        issueId,
        me.residenceId,
        item.label,
        description,
        reported,
        found.lot_id,
        found.place_id,
        found.priority,
        me.id,
        at,
        itemId,
      ),
    ])
    return { id: issueId }
  })

  return {
    options,
    templates,
    createTemplate,
    updateTemplate,
    removeTemplate,
    tasks,
    reviews,
    lotTasks,
    create,
    movements,
    task,
    day: agentDay,
    readiness,
    setCleanliness,
    createIssue,
    update,
    bulk,
    order,
    setStatus,
    updateItem,
    checkAll,
    checklist,
    comment,
    review,
  }
})

export class Cleaning extends Context.Service<Cleaning, Effect.Success<typeof make>>()('gresidence/Cleaning') {
  static readonly layer = Layer.effect(Cleaning, make)
}
