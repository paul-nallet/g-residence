import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { today } from '../src/domain/rules.ts'
import { SEED_ACCOUNTS, SEED_PASSWORD, seedSql } from './seed-data.ts'

const { values } = parseArgs({
  options: { 'persist-to': { type: 'string', default: '.wrangler/state' }, reset: { type: 'boolean', default: false } },
})
const persist = values['persist-to']

const wrangler = (...args: string[]) =>
  execFileSync('npx', ['wrangler', ...args, '--local', '--persist-to', persist], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })

if (values.reset) rmSync(join(persist, 'v3', 'd1'), { recursive: true, force: true })
wrangler('d1', 'migrations', 'apply', 'DB')

const existing = wrangler('d1', 'execute', 'DB', '--json', '--command', 'SELECT COUNT(*) AS count FROM residences')
if ((JSON.parse(existing) as Array<{ results: Array<{ count: number }> }>)[0]?.results[0]?.count) {
  console.error(
    `La base ${persist} contient déjà une résidence. Relancer avec « npm run db:seed:reset » pour la remplacer.`,
  )
  process.exit(1)
}

const directory = mkdtempSync(join(tmpdir(), 'gresidence-seed-'))
const file = join(directory, 'seed.sql')
try {
  writeFileSync(file, await seedSql(today()))
  wrangler('d1', 'execute', 'DB', '--file', file)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log(`Base ${persist} peuplée. Mot de passe commun : ${SEED_PASSWORD}`)
for (const account of SEED_ACCOUNTS) console.log(`  ${account.role.padEnd(8)} ${account.email}`)
