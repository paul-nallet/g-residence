import type { Priority } from '../domain/priority.ts'
import { Context, Effect, Layer } from 'effect'
import {
  CleaningAgentInvalid,
  CleaningAlreadyPlanned,
  type CleaningBulk,
  type CleaningChecklist,
  CleaningDayTaken,
  CleaningIncomplete,
  type CleaningItem,
  type CleaningItemKind,
  CleaningItemNotFound,
  type CleaningItemState,
  CleaningLocked,
  type CleaningPoint,
  type CleaningStatus,
  type CleaningTask,
  CleaningTaskNotFound,
  type CleaningTemplate,
  type CleaningTemplateInput,
  CleaningTemplateNameTaken,
  CleaningTemplateNotFound,
  MAX_PERIOD_DAYS,
  PAGE_SIZE,
} from '../domain/cleaning.ts'
import { now } from '../domain/clock.ts'
import { CurrentUser, manager } from '../domain/CurrentUser.ts'
import { InvalidInput } from '../domain/errors.ts'
import type { Me, Role } from '../domain/accounts.ts'
import { onViolation, sql, Sql, type SqlError, type Statement } from './Database.ts'

const taskColumns = `t.id,t.lot_id,l.number AS lot_number,COALESCE(b.name,'') AS building_name,t.agent_id,a.name AS agent_name,
  t.day,t.status,t.priority,t.template_name,t.note,t.report,t.completed_at,c.name AS completed_by,t.position,
  (SELECT COUNT(*) FROM cleaning_task_items i WHERE i.task_id=t.id) AS total,
  (SELECT COUNT(*) FROM cleaning_task_items i WHERE i.task_id=t.id AND i.state<>'todo') AS handled,
  (SELECT COUNT(*) FROM cleaning_task_items i WHERE i.task_id=t.id AND i.state='issue') AS issues,
  (SELECT json_group_array(label || ' : ' || note) FROM (SELECT i.label,i.note FROM cleaning_task_items i
    WHERE i.task_id=t.id AND i.state='issue' AND i.note<>'' ORDER BY i.position,i.rowid)) AS remarks
  FROM cleaning_tasks t JOIN lots l ON l.id=t.lot_id JOIN users a ON a.id=t.agent_id
  LEFT JOIN buildings b ON b.id=l.building_id AND b.residence_id=l.residence_id LEFT JOIN users c ON c.id=t.completed_by`
type TaskRow = Omit<CleaningTask, 'remarks'> & { remarks: string }
const taskOf = (row: TaskRow): CleaningTask => ({ ...row, remarks: JSON.parse(row.remarks) as string[] })
const visible = (me: Me) =>
  me.role === 'cleaner' ? { clause: ' AND t.agent_id=?', values: [me.id] } : { clause: '', values: [] }

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

const planned = (task: CleaningTask) => (task.status === 'planned' ? Effect.void : Effect.fail(new CleaningLocked()))

const violations = <A, E, R>(self: Effect.Effect<A, E | SqlError, R>) =>
  self.pipe(
    onViolation('UNIQUE constraint failed: cleaning_templates.', () => new CleaningTemplateNameTaken()),
    onViolation('UNIQUE constraint failed: cleaning_tasks.', () => new CleaningDayTaken()),
    onViolation('cleaning_agent', () => new CleaningAgentInvalid()),
    onViolation('cleaning_incomplete', () => new CleaningIncomplete()),
    onViolation('cleaning_locked', () => new CleaningLocked()),
    onViolation(
      'lot_unavailable',
      () => new InvalidInput({ message: 'Un des lots choisis est archivé ou introuvable. Rechargez la page.' }),
    ),
  )

const make = Effect.gen(function* () {
  const db = yield* Sql
  const write = (statements: Statement[]) => violations(db.batch(statements))

  const loadTemplates = Effect.fn('Cleaning.loadTemplates')(function* (me: Me) {
    const [rows, items, links] = yield* Effect.all([
      db.all<{ id: string; name: string; is_default: number }>(
        sql(
          'SELECT id,name,is_default FROM cleaning_templates WHERE residence_id=? ORDER BY is_default DESC,name COLLATE NOCASE',
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
    const [lots, agents, templates] = yield* Effect.all([
      db.all<{ id: string; number: string; building_name: string; template_id: string | null }>(
        sql(
          `SELECT l.id,l.number,COALESCE(b.name,'') AS building_name,(SELECT template_id FROM cleaning_lot_templates WHERE lot_id=l.id) AS template_id
          FROM lots l LEFT JOIN buildings b ON b.id=l.building_id AND b.residence_id=l.residence_id
          WHERE l.residence_id=? AND l.archived=0 ORDER BY l.number COLLATE NOCASE`,
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
    return { lots, agents, templates }
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
  }) {
    const me = yield* CurrentUser
    if (input.to < input.from || Date.parse(input.to) - Date.parse(input.from) > MAX_PERIOD_DAYS * 86400000)
      return yield* new InvalidInput({ message: 'Période invalide : six semaines au maximum.' })
    const scope = visible(me)
    const agent = me.role === 'cleaner' ? '' : (input.agent ?? '')
    const rows = yield* db.all<TaskRow>(
      sql(
        `SELECT ${taskColumns} WHERE t.residence_id=? AND t.day BETWEEN ? AND ? AND (?='' OR t.agent_id=?) AND (?='' OR t.priority=?)${scope.clause}
        ORDER BY t.day,CASE t.status WHEN 'planned' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,t.position IS NULL,t.position,
          CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,l.number COLLATE NOCASE,t.id`,
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

  const task = Effect.fn('Cleaning.task')(function* (id: string) {
    const me = yield* CurrentUser
    const found = yield* findTask(id)
    const items = yield* db.all<CleaningItem>(
      sql(
        `SELECT i.id,i.kind,i.label,i.state,i.note,u.name AS updated_by,i.updated_at FROM cleaning_task_items i
        LEFT JOIN users u ON u.id=i.updated_by WHERE i.task_id=? AND i.residence_id=? ORDER BY i.position,i.rowid`,
        id,
        me.residenceId,
      ),
    )
    return { task: found, items }
  })

  const create = Effect.fn('Cleaning.create')(function* (input: {
    readonly lot_ids: readonly string[]
    readonly agent_id: string
    readonly day: string
    readonly priority?: Priority
    readonly template_id: string
    readonly note: string
    readonly items?: readonly CleaningPoint[]
  }) {
    const me = yield* manager
    const lots = [...new Set(input.lot_ids)]
    const all = yield* loadTemplates(me)
    const explicit = input.template_id && input.template_id !== 'none'
    if (explicit && !all.some((template) => template.id === input.template_id))
      return yield* new CleaningTemplateNotFound()
    const fallback = all.find((template) => template.is_default)
    const taken = yield* db.all<{ lot_id: string; number: string }>(
      sql(
        `SELECT t.lot_id,l.number FROM cleaning_tasks t JOIN lots l ON l.id=t.lot_id
        WHERE t.residence_id=? AND t.day=? AND t.status<>'cancelled' AND t.lot_id IN (${placeholders(lots)})
        ORDER BY l.number COLLATE NOCASE`,
        me.residenceId,
        input.day,
        ...lots,
      ),
    )
    const free = lots.filter((lot) => !taken.some((row) => row.lot_id === lot))
    if (!free.length) return yield* new CleaningDayTaken()
    const createdAt = yield* now
    yield* write(
      free.flatMap((lot) => {
        const template =
          input.template_id === 'none'
            ? undefined
            : explicit
              ? all.find((item) => item.id === input.template_id)
              : (all.find((item) => item.lot_ids.includes(lot)) ?? fallback)
        const id = crypto.randomUUID()
        return [
          sql(
            `INSERT INTO cleaning_tasks(id,residence_id,lot_id,agent_id,day,template_name,note,priority,created_by,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)`,
            id,
            me.residenceId,
            lot,
            input.agent_id,
            input.day,
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
    return { created: free.length, skipped: taken.map((row) => row.number) }
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
    input: { agent_id: string; day: string; note: string; priority?: Priority },
  ) {
    const me = yield* manager
    const before = yield* findTask(id)
    yield* planned(before)
    yield* write([
      sql(
        'UPDATE cleaning_tasks SET agent_id=?,day=?,position=CASE WHEN day=? THEN position END,note=?,priority=? WHERE id=? AND residence_id=?',
        input.agent_id,
        input.day,
        input.day,
        input.note,
        input.priority ?? before.priority,
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

  const setStatus = Effect.fn('Cleaning.setStatus')(function* (
    id: string,
    input: { status: CleaningStatus; report: string },
  ) {
    const me = yield* CurrentUser
    const found = yield* findTask(id)
    if (input.status === 'done') {
      yield* planned(found)
      yield* write([
        sql(
          `UPDATE cleaning_tasks SET status='done',report=?,completed_at=?,completed_by=? WHERE id=? AND residence_id=? AND status='planned'`,
          input.report,
          yield* now,
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
        'UPDATE cleaning_tasks SET status=?,completed_at=NULL,completed_by=NULL WHERE id=? AND residence_id=?',
        input.status,
        id,
        me.residenceId,
      ),
    ])
    return { ok: true }
  })

  const updateItem = Effect.fn('Cleaning.updateItem')(function* (
    itemId: string,
    input: { state: CleaningItemState; note: string },
  ) {
    const me = yield* CurrentUser
    yield* planned(yield* findItem(itemId))
    yield* write([
      sql(
        'UPDATE cleaning_task_items SET state=?,note=?,updated_by=?,updated_at=? WHERE id=? AND residence_id=?',
        input.state,
        input.state === 'issue' ? input.note : '',
        me.id,
        yield* now,
        itemId,
        me.residenceId,
      ),
    ])
    return { ok: true }
  })

  const checkAll = Effect.fn('Cleaning.checkAll')(function* (taskId: string, kind: CleaningItemKind) {
    const me = yield* CurrentUser
    yield* planned(yield* findTask(taskId))
    yield* write([
      sql(
        `UPDATE cleaning_task_items SET state='done',note='',updated_by=?,updated_at=?
        WHERE task_id=? AND residence_id=? AND kind=? AND state='todo'`,
        me.id,
        yield* now,
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

  return {
    options,
    templates,
    createTemplate,
    updateTemplate,
    removeTemplate,
    tasks,
    lotTasks,
    create,
    movements,
    task,
    update,
    bulk,
    order,
    setStatus,
    updateItem,
    checkAll,
    checklist,
  }
})

export class Cleaning extends Context.Service<Cleaning, Effect.Success<typeof make>>()('gresidence/Cleaning') {
  static readonly layer = Layer.effect(Cleaning, make)
}
