import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import { Sync } from '../services/Sync.ts'
import { httpErrors } from './errors.ts'

const toHttp = httpErrors<never>({})

export const SyncLive = HttpApiBuilder.group(
  Api,
  'sync',
  Effect.fn(function* (handlers) {
    const sync = yield* Sync
    return handlers.handle('state', () => toHttp(sync.state()))
  }),
)
