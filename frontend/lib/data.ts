import { useCallback, useEffect, useRef, useState } from 'react'
import { messageOf } from './api.ts'
import { checkForChanges, subscribeToChanges } from './sync.ts'

export function useQuery<A>(key: string, load: () => Promise<A>) {
  const [result, setResult] = useState<{ key: string; data: A | null; error: string }>({
    key: '',
    data: null,
    error: '',
  })
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const version = ++generation.current
    try {
      const data = await load()
      if (version === generation.current) setResult({ key, data, error: '' })
    } catch (error) {
      if (version === generation.current) setResult({ key, data: null, error: messageOf(error) })
    }
  }, [key, load])
  useEffect(() => {
    const version = ++generation.current
    let active = true
    load().then(
      (data) => {
        if (active && version === generation.current) setResult({ key, data, error: '' })
      },
      (error) => {
        if (active && version === generation.current) setResult({ key, data: null, error: messageOf(error) })
      },
    )
    return () => {
      active = false
    }
  }, [key, load])
  useEffect(() => subscribeToChanges(() => void refresh()), [refresh])
  const current = result.key === key
  return { data: result.data, error: current ? result.error : '', isPending: !current, refresh }
}
export function useMutation() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('')
  const lock = useRef(false)
  const run = async (action: () => Promise<unknown>, done?: () => void) => {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await action()
      setSuccess('Enregistrement effectué.')
      done?.()
      void checkForChanges()
      return true
    } catch (cause) {
      setError(messageOf(cause))
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { busy, error, success, run }
}
