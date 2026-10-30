import { Clock, Effect } from 'effect'
import { parisDate } from './rules.ts'

export const now = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis).toISOString())
export const later = (millis: number) =>
  Effect.map(Clock.currentTimeMillis, (current) => new Date(current + millis).toISOString())
export const currentDay = Effect.map(Clock.currentTimeMillis, (millis) => parisDate(new Date(millis)))

const STAMP_WINDOW = 7 * 86400000
export const stamp = (at?: string) =>
  Effect.map(Clock.currentTimeMillis, (current) => {
    const millis = at ? Date.parse(at) : Number.NaN
    return new Date(millis <= current && millis >= current - STAMP_WINDOW ? millis : current).toISOString()
  })
