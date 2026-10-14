import { useCallback, useEffect, useState } from 'react'

const current = () => {
  const [path = '', query = ''] = window.location.hash.slice(1).split('?')
  return { path, params: new URLSearchParams(query) }
}

export function useHashParam<T extends string = string>(key: string, fallback: NoInfer<T>) {
  const read = useCallback(() => (current().params.get(key) ?? fallback) as T, [key, fallback])
  const [value, setValue] = useState(read)
  useEffect(() => {
    const sync = () => setValue(read())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [read])
  const update = useCallback(
    (next: T) => {
      setValue(next)
      const { path, params } = current()
      if (next === fallback) params.delete(key)
      else params.set(key, next)
      const query = params.toString()
      window.history.replaceState(null, '', '#' + path + (query ? '?' + query : ''))
    },
    [key, fallback],
  )
  return [value, update] as const
}

export function useHashPage(key = 'page') {
  const [value, setValue] = useHashParam(key, '1')
  const page = Math.max(1, Math.floor(Number(value)) || 1)
  const update = useCallback((next: number) => setValue(String(next)), [setValue])
  return [page, update] as const
}
