import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { CleaningDay, CleaningTaskDetail } from '../../src/domain/cleaning.ts'
import { call, isNetworkError } from './api.ts'
import { applyOps, type CleaningOp, isSatisfied, type NewCleaningOp } from './cleaningOps.ts'
import { useQuery } from './data.ts'
import { isReachable, reportReachable, subscribeToNetwork } from './network.ts'
import { checkForChanges } from './sync.ts'

const PREFIX = 'gresidence:offline:'
const KEPT_DAYS = 4

type Snapshot = { day: CleaningDay; savedAt: string }
type Failure = { op: CleaningOp; message: string }
type Stored = { days: Record<string, Snapshot>; ops: CleaningOp[]; failed: Failure[] }
export type Outbox = {
  ops: readonly CleaningOp[]
  sent: readonly { op: CleaningOp; at: number }[]
  failed: readonly Failure[]
  flushing: boolean
}

const empty = (): Stored => ({ days: {}, ops: [], failed: [] })
const listeners = new Set<() => void>()
let user = ''
let stored = empty()
let outbox: Outbox = { ops: [], sent: [], failed: [], flushing: false }

const read = (id: string): Stored => {
  try {
    const raw = localStorage.getItem(PREFIX + id)
    return raw ? { ...empty(), ...(JSON.parse(raw) as Stored) } : empty()
  } catch {
    return empty()
  }
}
const persist = () => {
  try {
    localStorage.setItem(PREFIX + user, JSON.stringify(stored))
  } catch {
    return
  }
}
const publish = (changes: Partial<Outbox>) => {
  outbox = { ...outbox, ops: stored.ops, failed: stored.failed, ...changes }
  for (const listener of listeners) listener()
}
const open = (id: string) => {
  if (id === user) return
  user = id
  stored = read(id)
  outbox = { ops: stored.ops, sent: [], failed: stored.failed, flushing: false }
  if (stored.ops.length) queueMicrotask(() => void flush())
}

const send = (op: CleaningOp) =>
  call((client) => {
    if (op.kind === 'item')
      return client.cleaning.item({ params: { id: op.itemId }, payload: { state: op.state, note: op.note, at: op.at } })
    if (op.kind === 'checkAll')
      return client.cleaning.checkAll({ params: { id: op.taskId }, payload: { kind: op.itemKind, at: op.at } })
    if (op.kind === 'finish')
      return client.cleaning.status({
        params: { id: op.taskId },
        payload: { status: 'done', report: op.report, at: op.at },
      })
    return client.cleaning.comment({ params: { id: op.taskId }, payload: { body: op.body, id: op.id, at: op.at } })
  })

const settle = (op: CleaningOp, failure?: string) => {
  stored = {
    ...stored,
    ops: stored.ops.filter((candidate) => candidate.id !== op.id),
    failed: failure ? [...stored.failed, { op, message: failure }] : stored.failed,
  }
  persist()
  publish(failure ? {} : { sent: [...outbox.sent, { op, at: Date.now() }] })
}

export const flush = async () => {
  if (outbox.flushing || !user) return
  publish({ flushing: true })
  let sent = 0
  try {
    for (let op = stored.ops[0]; op; op = stored.ops[0]) {
      try {
        await send(op)
        reportReachable(true)
        settle(op)
        sent++
      } catch (error) {
        if (isNetworkError(error)) {
          reportReachable(false)
          return
        }
        const message = error instanceof Error ? error.message : 'Envoi refusé.'
        try {
          const detail = await call((client) => client.cleaning.task({ params: { id: op.taskId } }))
          if (isSatisfied(detail, op)) {
            settle(op)
            sent++
          } else settle(op, message)
        } catch (cause) {
          if (isNetworkError(cause)) return
          settle(op, message)
        }
      }
    }
  } finally {
    publish({ flushing: false })
    if (sent) void checkForChanges()
  }
}

subscribeToNetwork(() => {
  if (isReachable()) void flush()
})

export const enqueue = (userId: string, op: NewCleaningOp) => {
  open(userId)
  stored = {
    ...stored,
    ops: [...stored.ops, { ...op, id: op.id ?? crypto.randomUUID(), at: new Date().toISOString() } as CleaningOp],
  }
  persist()
  publish({})
  void flush()
}

export const dismissFailure = (userId: string, opId: string) => {
  open(userId)
  stored = { ...stored, failed: stored.failed.filter((failure) => failure.op.id !== opId) }
  persist()
  publish({})
}

export const clearOffline = () => {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch {
    return
  } finally {
    user = ''
    stored = empty()
    publish({ sent: [], flushing: false })
  }
}

const saveDay = (userId: string, day: CleaningDay) => {
  open(userId)
  const days = { ...stored.days, [day.day]: { day, savedAt: new Date().toISOString() } }
  const kept = Object.keys(days).sort().slice(-KEPT_DAYS)
  stored = { ...stored, days: Object.fromEntries(kept.map((key) => [key, days[key]!])) }
  persist()
}

const saveTask = (userId: string, detail: CleaningTaskDetail) => {
  open(userId)
  const snapshot = stored.days[detail.task.day]
  if (!snapshot?.day.tasks.some((other) => other.task.id === detail.task.id)) return
  stored = {
    ...stored,
    days: {
      ...stored.days,
      [detail.task.day]: {
        ...snapshot,
        day: {
          ...snapshot.day,
          tasks: snapshot.day.tasks.map((other) => (other.task.id === detail.task.id ? detail : other)),
        },
      },
    },
  }
  persist()
}

const offlineCopy = <A>(error: unknown, find: () => A | undefined) => {
  if (!isNetworkError(error)) throw error
  reportReachable(false)
  const found = find()
  if (found === undefined) throw error
  return found
}

type Loaded<A> = { value: A; savedAt: string | null; loadedAt: number }

const loadDay = async (userId: string, date: string): Promise<Loaded<CleaningDay>> => {
  try {
    const day = await call((client) => client.cleaning.day({ query: { day: date } }))
    saveDay(userId, day)
    return { value: day, savedAt: null, loadedAt: Date.now() }
  } catch (error) {
    const snapshot = offlineCopy(error, () => (open(userId), stored.days[date]))
    return { value: snapshot.day, savedAt: snapshot.savedAt, loadedAt: Date.now() }
  }
}

const loadTask = async (userId: string, id: string): Promise<Loaded<CleaningTaskDetail>> => {
  try {
    const detail = await call((client) => client.cleaning.task({ params: { id } }))
    saveTask(userId, detail)
    return { value: detail, savedAt: null, loadedAt: Date.now() }
  } catch (error) {
    return offlineCopy(error, () => {
      open(userId)
      for (const snapshot of Object.values(stored.days)) {
        const detail = snapshot.day.tasks.find((other) => other.task.id === id)
        if (detail) return { value: detail, savedAt: snapshot.savedAt, loadedAt: Date.now() }
      }
      return undefined
    })
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useOutbox(userId: string) {
  open(userId)
  return useSyncExternalStore(subscribe, () => outbox)
}

const pendingSince = (box: Outbox, loadedAt: number) => [
  ...box.sent.filter((entry) => entry.at > loadedAt).map((entry) => entry.op),
  ...box.ops,
]

function useReconnect(refresh: () => Promise<void>) {
  useEffect(
    () =>
      subscribeToNetwork(() => {
        if (isReachable()) void refresh()
      }),
    [refresh],
  )
}

const nothing = () => Promise.resolve(null)

export function useCleaningDay(userId: string, author: string, date: string) {
  const load = useCallback(() => loadDay(userId, date), [userId, date])
  const result = useQuery<Loaded<CleaningDay> | null>(
    date ? `cleaning-day:${userId}:${date}` : '',
    date ? load : nothing,
  )
  const box = useOutbox(userId)
  useReconnect(result.refresh)
  const loaded = result.data
  const ops = loaded ? pendingSince(box, loaded.loadedAt) : []
  return {
    ...result,
    savedAt: loaded?.savedAt ?? null,
    data: loaded ? { ...loaded.value, tasks: loaded.value.tasks.map((detail) => applyOps(detail, ops, author)) } : null,
  }
}

export function useCleaningTask(userId: string, author: string, id: string, online: boolean) {
  const load = useCallback(
    async (): Promise<Loaded<CleaningTaskDetail>> =>
      online
        ? {
            value: await call((client) => client.cleaning.task({ params: { id } })),
            savedAt: null,
            loadedAt: Date.now(),
          }
        : loadTask(userId, id),
    [userId, id, online],
  )
  const result = useQuery('cleaning-task:' + id, load)
  const box = useOutbox(userId)
  useReconnect(result.refresh)
  const loaded = result.data
  return {
    ...result,
    savedAt: loaded?.savedAt ?? null,
    data: loaded ? (online ? loaded.value : applyOps(loaded.value, pendingSince(box, loaded.loadedAt), author)) : null,
  }
}
