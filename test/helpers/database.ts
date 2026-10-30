import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import type { DatabasePort } from '../../src/services/Database.ts'

const d1MaxExpressionDepth = 100

export const expressionDepth = (query: string) => {
  let depth = 0
  let deepest = 0
  for (const token of query.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, '').matchAll(/[()]/g)) {
    depth += token[0] === '(' ? 1 : -1
    deepest = Math.max(deepest, depth)
  }
  return deepest
}

export const database = (through = '9999') => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  const directory = new URL('../../migrations/', import.meta.url)
  for (const file of readdirSync(directory)
    .filter((entry) => entry.endsWith('.sql') && entry <= through)
    .sort()) {
    sqlite.exec('BEGIN')
    sqlite.exec(readFileSync(new URL(file, directory), 'utf8'))
    sqlite.exec('COMMIT')
  }
  const prepare = (query: string) => {
    if (expressionDepth(query) > d1MaxExpressionDepth)
      throw new Error(`Expression tree is too large (maximum depth ${d1MaxExpressionDepth})`)
    return sqlite.prepare(query)
  }
  const port: DatabasePort = {
    all: async <A>(s: { sql: string; values: SQLInputValue[] }) => prepare(s.sql).all(...s.values) as A[],
    first: async <A>(s: { sql: string; values: SQLInputValue[] }) =>
      (prepare(s.sql).get(...s.values) as A | undefined) ?? null,
    batch: async (statements) => {
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        for (const statement of statements) prepare(statement.sql).run(...statement.values)
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { port, sqlite }
}
