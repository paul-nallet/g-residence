import assert from 'node:assert/strict'
import test from 'node:test'
import type { AiCompletion, AiProviderPort, AiRequest } from '../src/services/AiProvider.ts'
import { createApiHandler } from '../src/server/Http.ts'
import { database } from './helpers/database.ts'

const scripted = (...replies: ((request: AiRequest) => AiCompletion)[]) => {
  const requests: AiRequest[] = []
  const port: AiProviderPort = {
    name: 'test',
    model: 'scripted',
    complete: async (request) => {
      requests.push(structuredClone(request))
      const next = replies.shift()
      if (!next) throw new Error('Plus de réponse prévue.')
      return next(request)
    },
  }
  return { port, requests }
}

const environment = async (ai?: AiProviderPort) => {
  const { port, sqlite } = database(),
    web = createApiHandler(port, '', ai)
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
  return { request, sqlite }
}

test('le studio signale l’absence de fournisseur', async () => {
  const { request } = await environment()
  const status = await request('/studio')
  assert.deepEqual(await status.json(), { available: false, provider: 'aucun', model: '' })
  const ask = await request('/studio/messages', 'POST', { messages: [{ role: 'user', content: 'Bonjour' }] })
  assert.equal(ask.status, 503)
})

test('le studio interroge l’état avec des outils et propose une action sans l’appliquer', async () => {
  const ai = scripted(
    () => ({ text: '', calls: [{ id: 'c1', name: 'stocks', input: { alert: true } }] }),
    (request) => {
      const last = request.turns.at(-1)
      assert.equal(last?.role, 'tool')
      const [result] = last.role === 'tool' ? last.results : []
      const page = JSON.parse(result!.content) as { items: { id: string }[] }
      return {
        text: '',
        calls: [
          {
            id: 'c2',
            name: 'proposer_mouvement_stock',
            input: {
              itemId: page.items[0]!.id,
              movement: { kind: 'in', quantity: 12, occurred_on: '2026-01-05', comment: '' },
            },
          },
          { id: 'c3', name: 'outil_absent', input: {} },
        ],
      }
    },
    () => ({ text: 'Le papier est sous le seuil ; je propose une entrée de 12.', calls: [] }),
  )
  const { request, sqlite } = await environment(ai.port)
  const created = await request('/stock', 'POST', {
    name: 'Papier toilette',
    categories: ['Hygiène'],
    unit: 'rouleaux',
    threshold: 10,
    initial: 2,
  })
  assert.equal(created.status, 200, await created.clone().text())
  const response = await request('/studio/messages', 'POST', {
    messages: [{ role: 'user', content: 'Que faut-il réapprovisionner ?' }],
    route: 'stock',
  })
  assert.equal(response.status, 200, await response.clone().text())
  const reply = (await response.json()) as {
    text: string
    steps: { tool: string; ok: boolean }[]
    proposals: { kind: string; summary: string }[]
  }
  assert.match(reply.text, /sous le seuil/)
  assert.deepEqual(
    reply.steps.map((step) => [step.tool, step.ok]),
    [
      ['stocks', true],
      ['proposer_mouvement_stock', true],
      ['outil_absent', false],
    ],
  )
  assert.equal(reply.proposals.length, 1)
  assert.match(reply.proposals[0]!.summary, /Entrée de 12 rouleaux · Papier toilette/)
  assert.match(ai.requests[0]!.system, /Résidence test/)
  assert.match(ai.requests[0]!.system, /#stock/)
  const quantity = sqlite.prepare('SELECT quantity FROM stock_items').get() as { quantity: number }
  assert.equal(quantity.quantity, 2)
})
