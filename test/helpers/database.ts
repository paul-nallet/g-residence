import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import type { DatabasePort } from '../../src/services/Database.ts'

export const database = (through = '9999') => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  const directory = new URL('../../migrations/', import.meta.url)
  for (const file of readdirSync(directory)
    .filter((entry) => entry.endsWith('.sql') && entry <= through)
    .sort())
    sqlite.exec(readFileSync(new URL(file, directory), 'utf8'))
  const port: DatabasePort = {
    all: async <A>(s: { sql: string; values: SQLInputValue[] }) => sqlite.prepare(s.sql).all(...s.values) as A[],
    first: async <A>(s: { sql: string; values: SQLInputValue[] }) =>
      (sqlite.prepare(s.sql).get(...s.values) as A | undefined) ?? null,
    batch: async (statements) => {
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.values)
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { port, sqlite }
}
