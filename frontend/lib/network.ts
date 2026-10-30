const listeners = new Set<() => void>()
let reachable = typeof navigator === 'undefined' || navigator.onLine

const notify = () => {
  for (const listener of listeners) listener()
}

export const isReachable = () => reachable
export const reportReachable = (value: boolean) => {
  if (value === reachable) return
  reachable = value
  notify()
}
export const subscribeToNetwork = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => reportReachable(true))
  window.addEventListener('offline', () => reportReachable(false))
}
