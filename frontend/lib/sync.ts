import { call, isNetworkError } from './api.ts'
import { reportReachable } from './network.ts'

const ACTIVE_INTERVAL = 10_000
const IDLE_INTERVAL = 60_000
const IDLE_AFTER = 5 * 60_000
const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
const listeners = new Set<() => void>()
let version: number | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let lastActivity = Date.now()
let checking = false
let recheck = false

const isIdle = () => Date.now() - lastActivity > IDLE_AFTER

const schedule = () => {
  clearTimeout(timer)
  timer = setTimeout(
    () => {
      void checkForChanges()
      schedule()
    },
    isIdle() ? IDLE_INTERVAL : ACTIVE_INTERVAL,
  )
}

export const checkForChanges = async (): Promise<void> => {
  if (listeners.size === 0 || (version !== null && document.visibilityState === 'hidden')) return
  if (checking) {
    recheck = true
    return
  }
  checking = true
  try {
    const state = await call((client) => client.sync.state())
    reportReachable(true)
    const changed = version !== null && state.version !== version
    version = state.version
    if (changed) for (const listener of listeners) listener()
  } catch (error) {
    if (isNetworkError(error)) reportReachable(false)
    return
  } finally {
    checking = false
    if (recheck) {
      recheck = false
      void checkForChanges()
    }
  }
}

const onVisible = () => {
  if (document.visibilityState !== 'visible') return
  lastActivity = Date.now()
  void checkForChanges()
  schedule()
}

const onActivity = () => {
  const wasIdle = isIdle()
  lastActivity = Date.now()
  if (!wasIdle) return
  void checkForChanges()
  schedule()
}

export const subscribeToChanges = (listener: () => void) => {
  listeners.add(listener)
  if (!timer) {
    lastActivity = Date.now()
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    for (const event of activityEvents) window.addEventListener(event, onActivity, { passive: true, capture: true })
    if (version === null) void checkForChanges()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0 || !timer) return
    clearTimeout(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisible)
    for (const event of activityEvents) window.removeEventListener(event, onActivity, { capture: true })
  }
}
