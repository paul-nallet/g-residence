import { Schema } from 'effect'
import { CleaningStatusInput } from './cleaning.ts'
import { ReadingInput } from './meters.ts'
import { MovementInput } from './stock.ts'
export const MAX_AUDIO_SECONDS = 120
const MAX_AUDIO_BASE64 = Math.ceil((44 + MAX_AUDIO_SECONDS * 16000 * 2) / 3) * 4
const MAX_SPEECH_TEXT = 4000

export const StudioMessage = Schema.Struct({
  role: Schema.Literals(['user', 'assistant']),
  content: Schema.String.check(
    Schema.isMinLength(1, { message: 'Message vide.' }),
    Schema.isMaxLength(8000, { message: 'Message trop long (8 000 caractères maximum).' }),
  ),
})
export type StudioMessage = typeof StudioMessage.Type
export const StudioInput = Schema.Struct({
  messages: Schema.Array(StudioMessage).check(
    Schema.isMinLength(1, { message: 'Posez une question.' }),
    Schema.isMaxLength(40, { message: 'Conversation trop longue. Recommencez une conversation.' }),
  ),
  route: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
})
export const StudioStep = Schema.Struct({ tool: Schema.String, label: Schema.String, ok: Schema.Boolean })
export type StudioStep = typeof StudioStep.Type
export const StudioProposal = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('stock_movement'),
    summary: Schema.String,
    itemId: Schema.String,
    movement: MovementInput,
  }),
  Schema.Struct({
    kind: Schema.Literal('meter_reading'),
    summary: Schema.String,
    meterId: Schema.String,
    reading: ReadingInput,
  }),
  Schema.Struct({
    kind: Schema.Literal('cleaning_status'),
    summary: Schema.String,
    taskId: Schema.String,
    status: CleaningStatusInput,
  }),
])
export type StudioProposal = typeof StudioProposal.Type
export const StudioReply = Schema.Struct({
  text: Schema.String,
  steps: Schema.Array(StudioStep),
  proposals: Schema.Array(StudioProposal),
})
export type StudioReply = typeof StudioReply.Type
export const StudioStatus = Schema.Struct({
  available: Schema.Boolean,
  provider: Schema.String,
  model: Schema.String,
  voice: Schema.Boolean,
})
export const TranscriptionInput = Schema.Struct({
  audio: Schema.String.check(
    Schema.isMinLength(1, { message: 'Enregistrement vide.' }),
    Schema.isMaxLength(MAX_AUDIO_BASE64, { message: 'Enregistrement trop long (2 minutes maximum).' }),
    Schema.isPattern(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'Enregistrement illisible.' }),
  ),
  mime: Schema.Literals(['audio/wav']),
})
export const Transcription = Schema.Struct({ text: Schema.String })
export const SpeechInput = Schema.Struct({
  text: Schema.String.check(
    Schema.isMinLength(1, { message: 'Texte vide.' }),
    Schema.isMaxLength(MAX_SPEECH_TEXT, { message: 'Texte trop long pour la lecture vocale.' }),
  ),
})
export const Speech = Schema.Struct({ audio: Schema.String, mime: Schema.String })

export class AiUnavailable extends Schema.TaggedError<AiUnavailable>()('AiUnavailable', {}) {}
export class AiFailed extends Schema.TaggedError<AiFailed>()('AiFailed', { reason: Schema.String }) {}
export class VoiceUnavailable extends Schema.TaggedError<VoiceUnavailable>()('VoiceUnavailable', {}) {}
export class AiTooManySteps extends Schema.TaggedError<AiTooManySteps>()('AiTooManySteps', {}) {}
export type StudioError = AiUnavailable | AiFailed | AiTooManySteps | VoiceUnavailable

export const MAX_STUDIO_STEPS = 8
export const MAX_TOOL_RESULT = 12000
