import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from '../api/Api.ts'
import { Feedback } from '../services/Feedback.ts'
import { httpErrors } from './errors.ts'

const toHttp = httpErrors<never>({})

export const FeedbackLive = HttpApiBuilder.group(
  Api,
  'feedback',
  Effect.fn(function* (handlers) {
    const feedback = yield* Feedback
    return handlers
      .handle('list', ({ query }) => toHttp(feedback.list(query)))
      .handle('create', ({ payload }) => toHttp(feedback.create(payload)))
  }),
)
