import { useSyncExternalStore } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void> }

const listeners = new Set<() => void>()
let deferred: InstallPrompt | null = null

const set = (value: InstallPrompt | null) => {
  deferred = value
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    set(event as InstallPrompt)
  })
  window.addEventListener('appinstalled', () => set(null))
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useInstallPrompt = () => useSyncExternalStore(subscribe, () => deferred)

export const install = async () => {
  const prompt = deferred
  if (!prompt) return
  set(null)
  await prompt.prompt()
}
