import { Schema } from 'effect'
import { PageNumber, RequiredText } from './shared.ts'

export const FeedbackKind = Schema.Literals(['idea', 'feature', 'bug'])
export type FeedbackKind = typeof FeedbackKind.Type
export const FeedbackInput = Schema.Struct({
  kind: FeedbackKind,
  message: RequiredText('Message', 2000),
})
export const FeedbackEntry = Schema.Struct({
  id: Schema.String,
  kind: FeedbackKind,
  message: Schema.String,
  author: Schema.String,
  created_at: Schema.String,
})
export type FeedbackEntry = typeof FeedbackEntry.Type
export const FeedbackPage = Schema.Struct({ items: Schema.Array(FeedbackEntry), total: Schema.Number })
export const FeedbackQuery = Schema.Struct({
  kind: Schema.optionalKey(FeedbackKind),
  page: Schema.optionalKey(PageNumber(1000000)),
})

export const PAGE_SIZE = 20
