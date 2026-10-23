import { Context, Effect, Layer } from 'effect'
import { AiFailed, VoiceUnavailable } from '../domain/studio.ts'

export type SpokenAudio = { audio: string; mime: string }

export interface VoiceProviderPort {
  readonly name: string
  transcribe(audio: Blob): Promise<string>
  speak(text: string): Promise<SpokenAudio>
}

export const unavailableVoice: VoiceProviderPort = {
  name: 'aucun',
  transcribe: () => Promise.reject(new Error('Aucun fournisseur vocal configuré.')),
  speak: () => Promise.reject(new Error('Aucun fournisseur vocal configuré.')),
}

export class VoicePort extends Context.Service<VoicePort, VoiceProviderPort>()('gresidence/VoicePort') {}

const fromBase64 = (data: string) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0))

const spokenText = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#+|[-*+]|\d+\.|>|\|)\s*/gm, '')
    .replace(/[*_`#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export class Voice extends Context.Service<
  Voice,
  {
    readonly available: boolean
    transcribe(audio: string, mime: string): Effect.Effect<{ text: string }, VoiceUnavailable | AiFailed>
    speak(text: string): Effect.Effect<SpokenAudio, VoiceUnavailable | AiFailed>
  }
>()('gresidence/Voice') {
  static readonly layer = Layer.effect(
    Voice,
    Effect.gen(function* () {
      const port = yield* VoicePort
      const available = port !== unavailableVoice
      const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, VoiceUnavailable | AiFailed> =>
        available
          ? Effect.tryPromise({
              try: run,
              catch: (cause) => new AiFailed({ reason: cause instanceof Error ? cause.message : String(cause) }),
            })
          : Effect.fail(new VoiceUnavailable())
      return Voice.of({
        available,
        transcribe: (audio, mime) =>
          Effect.map(
            attempt(() => port.transcribe(new Blob([fromBase64(audio)], { type: mime }))),
            (text) => ({ text: text.trim() }),
          ),
        speak: (text) => attempt(() => port.speak(spokenText(text))),
      })
    }),
  )
}
