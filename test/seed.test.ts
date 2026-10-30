import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, today } from '../src/domain/rules.ts'
import { createApiHandler } from '../src/server/Http.ts'
import { SEED_ACCOUNTS, SEED_PASSWORD, seedSql } from '../scripts/seed-data.ts'
import { database } from './helpers/database.ts'

test('le jeu de démonstration respecte contraintes et triggers et reste lisible par l’API', async () => {
  const { port, sqlite } = database()
  const day = today()
  sqlite.exec(await seedSql(day))
  for (const table of ['lots', 'stays', 'notices', 'inspections', 'cleaning_tasks', 'stock_items', 'issues', 'works'])
    assert.ok((sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n > 0, table)

  const web = createApiHandler(port)
  const request = (path: string, init: RequestInit = {}) =>
    web.handler(
      new Request('http://localhost/api' + path, {
        ...init,
        headers: { origin: 'http://localhost', 'content-type': 'application/json', ...init.headers },
      }),
    )
  for (const account of SEED_ACCOUNTS) {
    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: account.email, password: SEED_PASSWORD }),
    })
    assert.equal(login.status, 200, account.email)
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    if (account.role !== 'manager') continue
    for (const path of [
      '/lots',
      `/calendar?from=${addDays(day, -7)}&to=${addDays(day, 30)}`,
      `/reports/weekly?date=${day}`,
      `/meters?month=${day.slice(0, 7)}`,
      '/stock',
      `/revenue?month=${day.slice(0, 7)}`,
      `/cleaning/tasks?from=${addDays(day, -7)}&to=${addDays(day, 7)}`,
      '/cleaning/templates',
      '/technical/issues',
      '/technical/works',
      '/technical/visits',
      '/technical/visit-templates',
      '/feedback',
    ]) {
      const response = await request(path, { headers: { cookie } })
      assert.equal(response.status, 200, `${path} : ${await response.clone().text()}`)
    }
  }
})
