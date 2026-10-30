import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { database } from './helpers/database.ts'

test('migration de la préparation des lots : tâches conservées, types déduits et lots sales repérés', () => {
  const { sqlite } = database('0021_cleaning_review.sql')
  try {
    sqlite.exec(`
      INSERT INTO residences(id,name) VALUES('r','Résidence');
      INSERT INTO users(id,residence_id,email,name,role,password_hash,salt,created_at)
        VALUES('u','r','test@example.test','Agent','admin','test','test','2026-01-01');
      INSERT INTO buildings(id,residence_id,name) VALUES('b','r','Bâtiment A');
      INSERT INTO lots(id,residence_id,building_id,number) VALUES('sale','r','b','A01'),('propre','r','b','A02'),('occupe','r','b','A03');
      INSERT INTO stays(id,residence_id,lot_id,first_name,last_name,planned_start,planned_end,actual_start,actual_end)
        VALUES('s1','r','sale','A','A','2026-01-01','2026-03-01','2026-01-01','2026-03-01'),
              ('s2','r','propre','B','B','2026-01-01','2026-03-01','2026-01-01','2026-03-01'),
              ('s3','r','occupe','C','C','2026-01-01','2026-03-01','2026-01-01','2026-03-01'),
              ('s4','r','occupe','D','D','2026-03-02',NULL,'2026-03-02',NULL);
      INSERT INTO cleaning_tasks(id,residence_id,lot_id,agent_id,day,status,completed_at,completed_by,note,created_by,created_at,priority,position)
        VALUES('t1','r','propre','u','2026-03-01','done','2026-03-01T10:00:00.000Z','u','Consigne','u','2026-01-01','high',2),
              ('t2','r','sale','u','2026-02-01','planned',NULL,NULL,'','u','2026-01-01','normal',NULL);
      INSERT INTO cleaning_task_items(id,residence_id,task_id,kind,label,position) VALUES('i','r','t2','task','Aspirer',0);
      INSERT INTO cleaning_task_comments(id,residence_id,task_id,kind,body,author_id,created_at)
        VALUES('c','r','t1','note','Fait','u','2026-03-01');
    `)
    const before = sqlite.prepare('SELECT * FROM cleaning_tasks ORDER BY id').all()
    sqlite.exec('BEGIN')
    sqlite.exec(readFileSync(new URL('../migrations/0022_cleaning_readiness.sql', import.meta.url), 'utf8'))
    sqlite.exec('COMMIT')
    assert.deepEqual(
      sqlite
        .prepare('SELECT * FROM cleaning_tasks ORDER BY id')
        .all()
        .map((row) => ({ ...row })),
      before.map((row, index) => ({ ...row, place_id: null, type: index === 0 ? 'departure' : 'routine' })),
    )
    assert.deepEqual(
      sqlite
        .prepare('SELECT id,cleanliness,cleanliness_at FROM lots ORDER BY number')
        .all()
        .map((row) => ({ ...row })),
      [
        { id: 'sale', cleanliness: 'dirty', cleanliness_at: '2026-03-01' },
        { id: 'propre', cleanliness: 'clean', cleanliness_at: null },
        { id: 'occupe', cleanliness: 'clean', cleanliness_at: null },
      ],
    )
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0)
    assert.throws(
      () =>
        sqlite
          .prepare(
            "INSERT INTO cleaning_task_items(id,residence_id,task_id,kind,label,position) VALUES('x','r','t1','task','x',1)",
          )
          .run(),
      /cleaning_locked/,
    )
    assert.throws(
      () =>
        sqlite
          .prepare(
            "INSERT INTO cleaning_tasks(id,residence_id,agent_id,day,created_by,created_at) VALUES('t3','r','u','2026-04-01','u','2026-04-01')",
          )
          .run(),
      /CHECK constraint/,
    )
  } finally {
    sqlite.close()
  }
})
