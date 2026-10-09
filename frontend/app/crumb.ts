import { useEffect, useSyncExternalStore } from 'react'

let current = ''
const listeners = new Set<() => void>()
const publish = (label: string) => {
  current = label
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useCrumb = () => useSyncExternalStore(subscribe, () => current)
export const useDetailCrumb = (label: string) =>
  useEffect(() => {
    publish(label)
    return () => publish('')
  }, [label])
