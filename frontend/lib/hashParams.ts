import { useCallback, useState } from 'react'

const current = () => {
  const [path = '', query = ''] = window.location.hash.slice(1).split('?')
  return { path, params: new URLSearchParams(query) }
}

export function useHashParam(key: string, fallback: string) {
  const [value, setValue] = useState(() => current().params.get(key) ?? fallback)
  const update = useCallback(
    (next: string) => {
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
