import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { database } from './helpers/database.ts'

test('migration des priorités : données existantes conservées et niveaux contraints', () => {
  const { sqlite } = database('0017_weekly_report_indexes.sql')
  try {
    sqlite.exec(`
      INSERT INTO residences(id,name) VALUES('r','Résidence');
      INSERT INTO users(id,residence_id,email,name,role,password_hash,salt,created_at)
        VALUES('u','r','test@example.test','Agent','admin','test','test','2026-01-01');
      INSERT INTO buildings(id,residence_id,name) VALUES('b','r','Bâtiment A');
      INSERT INTO lots(id,residence_id,building_id,number) VALUES('l','r','b','A01');
      INSERT INTO works(id,residence_id,title,created_by,created_at) VALUES('w','r','Réparation','u','2026-01-01');
      INSERT INTO issues(id,residence_id,title,reported_on,created_by,created_at)
        VALUES('i','r','Fuite','2026-01-01','u','2026-01-01');
      INSERT INTO cleaning_tasks(id,residence_id,lot_id,agent_id,day,note,created_by,created_at)
        VALUES('t','r','l','u','2026-01-01','Consigne','u','2026-01-01');
    `)
    const tables = ['works', 'issues', 'cleaning_tasks']
    const before = tables.map((table) => sqlite.prepare('SELECT * FROM ' + table).get())
    sqlite.exec(readFileSync(new URL('../migrations/0018_priorities.sql', import.meta.url), 'utf8'))
    for (const [index, table] of tables.entries()) {
      assert.deepEqual({ ...sqlite.prepare('SELECT * FROM ' + table).get() }, { ...before[index], priority: 'normal' })
      assert.throws(() => sqlite.prepare('UPDATE ' + table + ' SET priority=?').run('invalid'), /CHECK constraint/)
      assert.throws(() => sqlite.prepare('UPDATE ' + table + ' SET priority=NULL').run(), /NOT NULL constraint/)
      for (const priority of ['low', 'normal', 'high', 'urgent'])
        sqlite.prepare('UPDATE ' + table + ' SET priority=?').run(priority)
    }
  } finally {
    sqlite.close()
  }
})
