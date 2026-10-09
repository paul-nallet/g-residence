import { Context, Effect, Schema } from 'effect'
import type { Me } from './accounts.ts'

export class CurrentUser extends Context.Service<CurrentUser, Me>()('gresidence/CurrentUser') {}

export class ManagementOnly extends Schema.TaggedError<ManagementOnly>()('ManagementOnly', {}) {}
export class AdminOnly extends Schema.TaggedError<AdminOnly>()('AdminOnly', {}) {}

export const manager = Effect.gen(function* () {
  const me = yield* CurrentUser
  if (me.role === 'cleaner') return yield* new ManagementOnly()
  return me
})

export const admin = Effect.gen(function* () {
  const me = yield* CurrentUser
  if (me.role !== 'admin') return yield* new AdminOnly()
  return me
})
