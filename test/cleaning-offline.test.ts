import assert from 'node:assert/strict'
import test from 'node:test'
import type { CleaningTaskDetail } from '../src/domain/cleaning.ts'
import { applyOps, type CleaningOp, isSatisfied } from '../frontend/lib/cleaningOps.ts'

const item = (id: string, kind: 'task' | 'check') => ({
  id,
  kind,
  label: id,
  state: 'todo' as const,
  note: '',
  updated_by: null,
  updated_at: null,
  issue_id: null,
  issue_status: null,
})
const detail = {
  task: { id: 't', status: 'planned', comments: 0, total: 3, handled: 0, issues: 0 },
  items: [item('a', 'task'), item('b', 'task'), item('c', 'check')],
  comments: [],
  supplies: [],
} as unknown as CleaningTaskDetail
const at = '2026-10-30T08:00:00.000Z'

test('hors ligne : actions appliquées localement dans l’ordre puis reconnues une fois envoyées', () => {
  const ops: CleaningOp[] = [
    { id: '1', taskId: 't', at, kind: 'item', itemId: 'c', state: 'issue', note: 'Ampoule grillée' },
    { id: '2', taskId: 't', at, kind: 'finish', report: '' },
    { id: '3', taskId: 't', at, kind: 'checkAll', itemKind: 'task' },
    { id: '4', taskId: 't', at, kind: 'comment', body: 'Sous-sol sans réseau' },
    { id: '5', taskId: 't', at, kind: 'finish', report: 'Fait' },
    { id: '6', taskId: 'autre', at, kind: 'checkAll', itemKind: 'check' },
  ]
  const result = applyOps(detail, ops, 'Agent')
  assert.deepEqual(
    result.items.map((entry) => [entry.id, entry.state, entry.note, entry.updated_by]),
    [
      ['a', 'done', '', 'Agent'],
      ['b', 'done', '', 'Agent'],
      ['c', 'issue', 'Ampoule grillée', 'Agent'],
    ],
  )
  assert.deepEqual(
    [result.task.status, result.task.report, result.task.completed_at, result.task.handled, result.task.issues],
    ['done', 'Fait', at, 3, 1],
  )
  assert.deepEqual(
    result.comments.map((comment) => [comment.id, comment.body]),
    [['4', 'Sous-sol sans réseau']],
  )
  assert.equal(applyOps(result, ops, 'Agent').comments.length, 1)
  assert.deepEqual(
    ops.map((op) => isSatisfied(result, op)),
    [true, true, true, true, true, true],
  )
  assert.equal(isSatisfied(detail, ops[0]!), false)
})
