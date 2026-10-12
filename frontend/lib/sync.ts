import { call } from './api.ts'

const INTERVAL = 10_000
const listeners = new Set<() => void>()
let version: number | null = null
let timer: ReturnType<typeof setInterval> | undefined
let checking = false
let recheck = false

export const checkForChanges = async (): Promise<void> => {
  if (listeners.size === 0 || (version !== null && document.visibilityState === 'hidden')) return
  if (checking) {
    recheck = true
    return
  }
  checking = true
  try {
    const state = await call((client) => client.sync.state())
    const changed = version !== null && state.version !== version
    version = state.version
    if (changed) for (const listener of listeners) listener()
  } catch {
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
  if (document.visibilityState === 'visible') void checkForChanges()
}

export const subscribeToChanges = (listener: () => void) => {
  listeners.add(listener)
  if (!timer) {
    timer = setInterval(() => void checkForChanges(), INTERVAL)
    document.addEventListener('visibilitychange', onVisible)
    if (version === null) void checkForChanges()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0 || !timer) return
    clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisible)
  }
}
