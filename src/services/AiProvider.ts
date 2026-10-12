import { Context, Effect, Layer } from 'effect'
import { AiFailed, AiUnavailable } from '../domain/studio.ts'

export type AiToolSpec = { name: string; description: string; parameters: Record<string, unknown> }
export type AiToolCall = { id: string; name: string; input: unknown }
export type AiToolResult = { id: string; content: string; isError: boolean }
export type AiTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; calls: AiToolCall[]; raw?: unknown }
  | { role: 'tool'; results: AiToolResult[] }
export type AiRequest = { system: string; turns: AiTurn[]; tools: AiToolSpec[] }
export type AiCompletion = { text: string; calls: AiToolCall[]; raw?: unknown }

export interface AiProviderPort {
  readonly name: string
  readonly model: string
  complete(request: AiRequest): Promise<AiCompletion>
}

export const unavailableAi: AiProviderPort = {
  name: 'aucun',
  model: '',
  complete: () => Promise.reject(new Error('Aucun fournisseur IA configuré.')),
}

export class AiPort extends Context.Service<AiPort, AiProviderPort>()('gresidence/AiPort') {}

export class AiProvider extends Context.Service<
  AiProvider,
  {
    readonly available: boolean
    readonly name: string
    readonly model: string
    complete(request: AiRequest): Effect.Effect<AiCompletion, AiUnavailable | AiFailed>
  }
>()('gresidence/AiProvider') {
  static readonly layer = Layer.effect(
    AiProvider,
    Effect.gen(function* () {
      const port = yield* AiPort
      const available = port !== unavailableAi
      return AiProvider.of({
        available,
        name: port.name,
        model: port.model,
        complete: (request) =>
          available
            ? Effect.tryPromise({
                try: () => port.complete(request),
                catch: (cause) => new AiFailed({ reason: cause instanceof Error ? cause.message : String(cause) }),
              })
            : Effect.fail(new AiUnavailable()),
      })
    }),
  )
}
