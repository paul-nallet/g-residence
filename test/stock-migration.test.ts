import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { database } from './helpers/database.ts'

test('migration des catégories de stock existantes vers plusieurs catégories', () => {
  const { sqlite } = database('0007_stock.sql')
  sqlite.exec(`INSERT INTO residences(id,name) VALUES('r','Résidence');
    INSERT INTO stock_items(id,residence_id,name,category,unit,threshold,quantity) VALUES
    ('a','r','Couette','Literie','',0,2),('b','r','Drap','literie','',0,1),('c','r','Tabouret','','',0,3)`)
  sqlite.exec(readFileSync(new URL('../migrations/0008_stock_categories.sql', import.meta.url), 'utf8'))
  assert.deepEqual(
    sqlite
      .prepare('SELECT name FROM stock_categories')
      .all()
      .map((row) => row.name),
    ['Literie'],
  )
  assert.deepEqual(
    sqlite
      .prepare('SELECT item_id FROM stock_item_categories ORDER BY item_id')
      .all()
      .map((row) => row.item_id),
    ['a', 'b'],
  )
  assert.equal(
    (sqlite.prepare('SELECT quantity FROM stock_items WHERE id=?').get('c') as { quantity: number }).quantity,
    3,
  )
})

test('migration des catégories affichées en vue vers des vues nommées', () => {
  const { sqlite } = database('0009_stock_views.sql')
  sqlite.exec(`INSERT INTO residences(id,name) VALUES('r','Résidence');
    INSERT INTO stock_categories(id,residence_id,name,is_view) VALUES('c1','r','Stock Coworking',1),('c2','r','Hygiène',0)`)
  sqlite.exec(readFileSync(new URL('../migrations/0011_stock_named_views.sql', import.meta.url), 'utf8'))
  assert.deepEqual(
    sqlite
      .prepare('SELECT id,name FROM stock_views')
      .all()
      .map((row) => [row.id, row.name]),
    [['c1', 'Stock Coworking']],
  )
  assert.deepEqual(
    sqlite
      .prepare('SELECT view_id,category_id FROM stock_view_categories')
      .all()
      .map((row) => [row.view_id, row.category_id]),
    [['c1', 'c1']],
  )
})
