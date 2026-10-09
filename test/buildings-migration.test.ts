import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { database } from './helpers/database.ts'

for (const existingBuilding of [false, true]) {
  test(`migration des lots existants avec bâtiment A ${existingBuilding ? 'existant' : 'à créer'}`, () => {
    const { sqlite } = database('0004_buildings.sql')
    try {
      sqlite.prepare('INSERT INTO residences(id,name) VALUES(?,?)').run('residence', 'Résidence')
      if (existingBuilding)
        sqlite
          .prepare('INSERT INTO buildings(id,residence_id,name) VALUES(?,?,?)')
          .run('existing-a', 'residence', 'Bâtiment A')
      sqlite.prepare('INSERT INTO buildings(id,residence_id,name) VALUES(?,?,?)').run('b', 'residence', 'Bâtiment B')
      sqlite.prepare('INSERT INTO lots(id,residence_id,number) VALUES(?,?,?)').run('legacy', 'residence', 'A01')
      sqlite
        .prepare('INSERT INTO lots(id,residence_id,number,building_id) VALUES(?,?,?,?)')
        .run('assigned', 'residence', 'B01', 'b')
      sqlite
        .prepare('INSERT INTO stays(id,residence_id,lot_id,first_name,last_name,planned_start) VALUES(?,?,?,?,?,?)')
        .run('stay', 'residence', 'legacy', 'Test', 'Test', '2026-01-01')
      const stay = sqlite.prepare('SELECT * FROM stays').get()
      sqlite.exec(readFileSync(new URL('../migrations/0005_required_building.sql', import.meta.url), 'utf8'))
      assert.deepEqual(sqlite.prepare('SELECT * FROM stays').get(), stay)
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS total FROM lots').get() as { total: number }).total, 2)
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS total FROM buildings').get() as { total: number }).total, 2)
      assert.equal(
        (sqlite.prepare("SELECT building_id FROM lots WHERE id='legacy'").get() as { building_id: string }).building_id,
        existingBuilding ? 'existing-a' : 'building-a-residence',
      )
      assert.equal(
        (sqlite.prepare("SELECT building_id FROM lots WHERE id='assigned'").get() as { building_id: string })
          .building_id,
        'b',
      )
      assert.throws(
        () => sqlite.prepare("UPDATE lots SET building_id=NULL WHERE id='legacy'").run(),
        /building_required/,
      )
    } finally {
      sqlite.close()
    }
  })
}
