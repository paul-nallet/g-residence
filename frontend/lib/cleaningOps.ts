import type {
  CleaningItem,
  CleaningItemKind,
  CleaningItemState,
  CleaningTaskDetail,
} from '../../src/domain/cleaning.ts'

type Base = { id: string; taskId: string; at: string }
export type CleaningOp =
  | (Base & { kind: 'item'; itemId: string; state: CleaningItemState; note: string })
  | (Base & { kind: 'checkAll'; itemKind: CleaningItemKind })
  | (Base & { kind: 'finish'; report: string })
  | (Base & { kind: 'comment'; body: string })
export type NewCleaningOp = CleaningOp extends infer Op
  ? Op extends CleaningOp
    ? Omit<Op, 'id' | 'at'> & { id?: string }
    : never
  : never

const counts = (items: readonly CleaningItem[]) => ({
  total: items.length,
  handled: items.filter((item) => item.state !== 'todo').length,
  issues: items.filter((item) => item.state === 'issue').length,
})

const applyOne = (detail: CleaningTaskDetail, op: CleaningOp, author: string): CleaningTaskDetail => {
  if (op.taskId !== detail.task.id) return detail
  if (op.kind === 'comment')
    return detail.comments.some((comment) => comment.id === op.id)
      ? detail
      : {
          ...detail,
          task: { ...detail.task, comments: detail.task.comments + 1 },
          comments: [...detail.comments, { id: op.id, kind: 'note', body: op.body, author, created_at: op.at }],
        }
  if (detail.task.status !== 'planned') return detail
  if (op.kind === 'finish') {
    if (detail.items.some((item) => item.state === 'todo')) return detail
    return {
      ...detail,
      task: {
        ...detail.task,
        status: 'done',
        report: op.report,
        completed_at: op.at,
        completed_by: author,
        review: null,
        reviewed_at: null,
        reviewed_by: null,
      },
    }
  }
  const items = detail.items.map((item): CleaningItem => {
    if (op.kind === 'item' ? item.id !== op.itemId : item.kind !== op.itemKind || item.state !== 'todo') return item
    const state = op.kind === 'item' ? op.state : 'done'
    return {
      ...item,
      state,
      note: op.kind === 'item' && state === 'issue' ? op.note : '',
      updated_by: author,
      updated_at: op.at,
    }
  })
  return { ...detail, items, task: { ...detail.task, ...counts(items) } }
}

export const applyOps = (detail: CleaningTaskDetail, ops: readonly CleaningOp[], author: string) =>
  ops.reduce((current, op) => applyOne(current, op, author), detail)

export const isSatisfied = (detail: CleaningTaskDetail, op: CleaningOp) => {
  if (op.kind === 'comment') return detail.comments.some((comment) => comment.id === op.id)
  if (op.kind === 'finish') return detail.task.status === 'done'
  if (op.kind === 'checkAll') return !detail.items.some((item) => item.kind === op.itemKind && item.state === 'todo')
  const item = detail.items.find((candidate) => candidate.id === op.itemId)
  return !!item && item.state === op.state && (op.state !== 'issue' || item.note === op.note)
}
