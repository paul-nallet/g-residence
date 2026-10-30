import type { Status } from '../../src/domain/accounts.ts'
import { call, isNetworkError } from './api.ts'
import { clearOffline } from './cleaningOffline.ts'

const KEY = 'gresidence:session'

const remember = (status: typeof Status.Type) => {
  try {
    if (status.me) localStorage.setItem(KEY, JSON.stringify(status))
    else localStorage.removeItem(KEY)
  } catch {
    return
  }
}
const remembered = () => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as typeof Status.Type) : null
  } catch {
    return null
  }
}

export const loadSession = async () => {
  try {
    const status = await call((client) => client.auth.status())
    remember(status)
    return status
  } catch (error) {
    const status = isNetworkError(error) ? remembered() : null
    if (status) return status
    throw error
  }
}

export const forgetSession = () => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    return
  } finally {
    clearOffline()
  }
}
