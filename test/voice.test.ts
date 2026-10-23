import assert from 'node:assert/strict'
import test from 'node:test'
import type { AiProviderPort } from '../src/services/AiProvider.ts'
import { mistralProvider, mistralVoice } from '../src/services/mistralProvider.ts'
import type { VoiceProviderPort } from '../src/services/Voice.ts'
import { createApiHandler } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'

const silentAi: AiProviderPort = { name: 'test', model: 'muet', complete: async () => ({ text: '', calls: [] }) }

const environment = async (voice?: VoiceProviderPort) => {
  const web = createApiHandler(database().port, '', silentAi, voice)
  let cookie = ''
  const request = (path: string, method = 'GET', body?: unknown) =>
    web.handler(
      new Request('http://localhost/api' + path, {
        method,
        headers: {
          origin: 'http://localhost',
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  const setup = await request('/auth/setup', 'POST', {
    name: 'Gestionnaire',
    residenceName: 'Résidence test',
    email: 'admin@example.test',
    password: 'Validation-seulement-2026',
  })
  assert.equal(setup.status, 200, await setup.clone().text())
  cookie = setup.headers.get('set-cookie')!.split(';')[0]!
  return request
}

const wav = Buffer.from('RIFF0000WAVEfmt ').toString('base64')

test('la voix reste inactive sans fournisseur vocal', async () => {
  const request = await environment()
  const status = (await (await request('/studio')).json()) as { voice: boolean }
  assert.equal(status.voice, false)
  const response = await request('/studio/transcriptions', 'POST', { audio: wav, mime: 'audio/wav' })
  assert.equal(response.status, 503)
})

test('la dictée est transcrite et la réponse lue sans balisage', async () => {
  const received: { audio?: Blob; text?: string } = {}
  const request = await environment({
    name: 'test',
    transcribe: async (audio) => {
      received.audio = audio
      return '  Quels articles sont sous le seuil ?  '
    },
    speak: async (text) => {
      received.text = text
      return { audio: 'SUQz', mime: 'audio/mpeg' }
    },
  })
  const status = (await (await request('/studio')).json()) as { voice: boolean }
  assert.equal(status.voice, true)
  const transcription = await request('/studio/transcriptions', 'POST', { audio: wav, mime: 'audio/wav' })
  assert.equal(transcription.status, 200, await transcription.clone().text())
  assert.deepEqual(await transcription.json(), { text: 'Quels articles sont sous le seuil ?' })
  assert.equal(received.audio?.type, 'audio/wav')
  assert.equal(Buffer.from(await received.audio!.arrayBuffer()).toString(), 'RIFF0000WAVEfmt ')
  const speech = await request('/studio/speech', 'POST', { text: '## Stocks\n- **Papier** : 2 rouleaux' })
  assert.deepEqual(await speech.json(), { audio: 'SUQz', mime: 'audio/mpeg' })
  assert.equal(received.text, 'Stocks Papier : 2 rouleaux')
  const invalid = await request('/studio/transcriptions', 'POST', { audio: 'pas du base64 !', mime: 'audio/wav' })
  assert.equal(invalid.status, 400)
})

const mockFetch = (t: test.TestContext, responses: unknown[]) => {
  const calls: { url: string; init: RequestInit }[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Response.json(responses.shift())
  })
  return calls
}

test('l’adaptateur Mistral traduit les outils et rejoue les appels', async (t) => {
  const calls = mockFetch(t, [
    {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [
              { id: 'abc123def', type: 'function', function: { name: 'stocks', arguments: '{"alert":true}' } },
            ],
          },
        },
      ],
    },
    { choices: [{ finish_reason: 'stop', message: { content: [{ type: 'text', text: 'Deux articles.' }] } }] },
  ])
  const ai = mistralProvider({ apiKey: 'cle' })
  const tools = [{ name: 'stocks', description: 'Stocks', parameters: { type: 'object' } }]
  const first = await ai.complete({ system: 'Système', turns: [{ role: 'user', text: 'Stocks ?' }], tools })
  assert.deepEqual(first.calls, [{ id: 'abc123def', name: 'stocks', input: { alert: true } }])
  const second = await ai.complete({
    system: 'Système',
    turns: [
      { role: 'user', text: 'Stocks ?' },
      { role: 'assistant', text: first.text, calls: first.calls, raw: first.raw },
      { role: 'tool', results: [{ id: 'abc123def', content: '[]', isError: false }] },
    ],
    tools,
  })
  assert.equal(second.text, 'Deux articles.')
  assert.equal(calls[1]!.url, 'https://api.mistral.ai/v1/chat/completions')
  assert.equal((calls[1]!.init.headers as Record<string, string>).authorization, 'Bearer cle')
  const body = JSON.parse(String(calls[1]!.init.body)) as {
    model: string
    messages: { role: string }[]
    tools: unknown[]
  }
  assert.equal(body.model, 'mistral-medium-latest')
  assert.deepEqual(
    body.messages.map((message) => message.role),
    ['system', 'user', 'assistant', 'tool'],
  )
  assert.deepEqual(body.messages[3], { role: 'tool', tool_call_id: 'abc123def', content: '[]' })
  assert.deepEqual(body.tools, [{ type: 'function', function: tools[0] }])
})

test('la voix Mistral choisit une voix française et transcrit en français', async (t) => {
  const calls = mockFetch(t, [
    { text: 'Bonjour' },
    {
      items: [
        { id: 'en-1', name: 'Paul', languages: ['en'] },
        { id: 'fr-1', name: 'Marie', languages: ['fr'] },
      ],
    },
    { audio_data: 'SUQz' },
    { audio_data: 'SUQz' },
  ])
  const voice = mistralVoice({ apiKey: 'cle' })
  assert.equal(await voice.transcribe(new Blob(['x'], { type: 'audio/wav' })), 'Bonjour')
  const form = calls[0]!.init.body as FormData
  assert.equal(form.get('model'), 'voxtral-mini-latest')
  assert.equal(form.get('language'), 'fr')
  assert.deepEqual(await voice.speak('Bonjour'), { audio: 'SUQz', mime: 'audio/mpeg' })
  await voice.speak('Encore')
  assert.equal(calls.filter((call) => call.url.includes('/audio/voices')).length, 1)
  assert.equal((JSON.parse(String(calls[3]!.init.body)) as { voice_id: string }).voice_id, 'fr-1')
})
