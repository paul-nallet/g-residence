import assert from 'node:assert/strict'
import { test } from 'node:test'
import { folded, sql } from '../src/services/Database.ts'
import { database, expressionDepth } from './helpers/database.ts'

test('la recherche sans accents reste sous la profondeur d’expression de D1', () => {
  assert.ok(expressionDepth(`SELECT 1 WHERE ${folded('x')} LIKE ?`) < 100)
})

test('une requête trop profonde échoue comme sur D1', async () => {
  const { port } = database()
  const deep = `SELECT ${folded(folded(folded("'a'")))} AS v`
  await assert.rejects(port.first(sql(deep)), /maximum depth 100/)
  assert.equal((await port.first<{ v: string }>(sql(`SELECT ${folded("'é'")} AS v`)))?.v, 'e')
  assert.equal(expressionDepth("SELECT '((((' AS v"), 0)
})
