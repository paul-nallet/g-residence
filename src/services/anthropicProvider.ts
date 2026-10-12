import Anthropic from '@anthropic-ai/sdk'
import type { AiProviderPort, AiTurn } from './AiProvider.ts'

type Message = Anthropic.Beta.BetaMessageParam

const toMessages = (turns: AiTurn[]): Message[] =>
  turns.map((turn): Message => {
    if (turn.role === 'user') return { role: 'user', content: turn.text }
    if (turn.role === 'tool')
      return {
        role: 'user',
        content: turn.results.map((result) => ({
          type: 'tool_result' as const,
          tool_use_id: result.id,
          content: result.content,
          is_error: result.isError,
        })),
      }
    if (turn.raw) return { role: 'assistant', content: turn.raw as Anthropic.Beta.BetaContentBlockParam[] }
    return { role: 'assistant', content: turn.text }
  })

export const anthropicProvider = (options: { apiKey: string; model?: string }): AiProviderPort => {
  const client = new Anthropic({ apiKey: options.apiKey })
  const model = options.model || 'claude-opus-5-5'
  return {
    name: 'anthropic',
    model,
    complete: async (request) => {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: request.system,
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as Anthropic.Beta.BetaTool.InputSchema,
        })),
        messages: toMessages(request.turns),
      })
      if (response.stop_reason === 'refusal') throw new Error('Le modèle a refusé de répondre à cette demande.')
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n')
        .trim()
      const calls = response.content.flatMap((block) =>
        block.type === 'tool_use' ? [{ id: block.id, name: block.name, input: block.input }] : [],
      )
      return { text, calls, raw: response.content }
    },
  }
}
