import { Schema } from 'effect'

export const SyncState = Schema.Struct({ version: Schema.Number })
export type SyncState = typeof SyncState.Type
