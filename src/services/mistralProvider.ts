import type { AiProviderPort, AiToolCall, AiTurn } from './AiProvider.ts'
import type { VoiceProviderPort } from './Voice.ts'

const BASE_URL = 'https://api.mistral.ai/v1'

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
type Chunk = { type: string; text?: string }
type ChatResponse = {
  choices: { finish_reason: string; message: { content: string | Chunk[] | null; tool_calls?: ToolCall[] | null } }[]
}

const request = async <A>(apiKey: string, path: string, init: RequestInit): Promise<A> => {
  const response = await fetch(BASE_URL + path, {
    ...init,
    headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json', ...init.headers },
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`Mistral ${response.status}${detail ? ' : ' + detail : ''}`)
  }
  return (await response.json()) as A
}

const textOf = (content: string | Chunk[] | null) =>
  typeof content === 'string'
    ? content
    : (content ?? []).flatMap((chunk) => (chunk.type === 'text' && chunk.text ? [chunk.text] : [])).join('\n')

const toMessages = (system: string, turns: AiTurn[]): Message[] => [
  { role: 'system', content: system },
  ...turns.flatMap((turn): Message[] => {
    if (turn.role === 'user') return [{ role: 'user', content: turn.text }]
    if (turn.role === 'tool')
      return turn.results.map((result) => ({
        role: 'tool',
        tool_call_id: result.id,
        content: result.isError ? 'Erreur : ' + result.content : result.content,
      }))
    if (turn.calls.length === 0) return [{ role: 'assistant', content: turn.text }]
    return [
      {
        role: 'assistant',
        content: turn.text,
        tool_calls: (turn.raw as ToolCall[] | undefined) ?? turn.calls.map(toToolCall),
      },
    ]
  }),
]

const toToolCall = (call: AiToolCall): ToolCall => ({
  id: call.id,
  type: 'function',
  function: { name: call.name, arguments: JSON.stringify(call.input) },
})

const parseArguments = (value: string) => {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

export const mistralProvider = (options: { apiKey: string; model?: string }): AiProviderPort => {
  const model = options.model || 'mistral-medium-latest'
  return {
    name: 'mistral',
    model,
    complete: async ({ system, turns, tools }) => {
      const response = await request<ChatResponse>(options.apiKey, '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: toMessages(system, turns),
          tools: tools.map((tool) => ({ type: 'function', function: tool })),
          tool_choice: 'auto',
          parallel_tool_calls: true,
        }),
      })
      const message = response.choices[0]?.message
      if (!message) throw new Error('Réponse vide du modèle.')
      const raw = message.tool_calls ?? []
      const calls = raw.map((call) => ({
        id: call.id,
        name: call.function.name,
        input: parseArguments(call.function.arguments),
      }))
      return { text: textOf(message.content).trim(), calls, raw: raw.length > 0 ? raw : undefined }
    },
  }
}

type VoiceList = { items: { id: string; name: string; languages?: string[] }[] }

export const mistralVoice = (options: {
  apiKey: string
  transcriptionModel?: string
  speechModel?: string
  voice?: string
}): VoiceProviderPort => {
  let voice: Promise<string> | undefined
  const resolveVoice = async () => {
    if (options.voice) return options.voice
    const { items } = await request<VoiceList>(options.apiKey, '/audio/voices?type=preset&limit=100', {})
    const chosen = items.find((item) => item.languages?.some((language) => language.startsWith('fr'))) ?? items[0]
    if (!chosen) throw new Error('Aucune voix Mistral disponible.')
    return chosen.id
  }
  return {
    name: 'mistral',
    transcribe: async (audio) => {
      const body = new FormData()
      body.append('model', options.transcriptionModel || 'voxtral-mini-latest')
      body.append('language', 'fr')
      body.append('file', audio, 'dictee.wav')
      const { text } = await request<{ text: string }>(options.apiKey, '/audio/transcriptions', {
        method: 'POST',
        body,
      })
      return text
    },
    speak: async (text) => {
      voice ??= resolveVoice().catch((error: unknown) => {
        voice = undefined
        throw error
      })
      const { audio_data } = await request<{ audio_data: string }>(options.apiKey, '/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: options.speechModel || 'voxtral-mini-tts-3',
          voice_id: await voice,
          input: text,
          response_format: 'mp3',
        }),
      })
      return { audio: audio_data, mime: 'audio/mpeg' }
    },
  }
}
