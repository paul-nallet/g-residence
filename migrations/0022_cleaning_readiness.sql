PRAGMA defer_foreign_keys = ON;

ALTER TABLE lots ADD COLUMN cleanliness TEXT NOT NULL DEFAULT 'clean' CHECK(cleanliness IN ('dirty','clean','inspected','out_of_service'));
ALTER TABLE lots ADD COLUMN cleanliness_at TEXT;

ALTER TABLE cleaning_templates ADD COLUMN default_type TEXT CHECK(default_type IS NULL OR default_type IN ('departure','routine','deep','arrival','commons'));
CREATE UNIQUE INDEX cleaning_type_template ON cleaning_templates(residence_id,default_type) WHERE default_type IS NOT NULL;

CREATE TABLE cleaning_tasks_backup AS SELECT * FROM cleaning_tasks;
DROP TABLE cleaning_tasks;

CREATE TABLE cleaning_tasks (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  lot_id TEXT REFERENCES lots(id),
  place_id TEXT,
  type TEXT NOT NULL DEFAULT 'routine' CHECK(type IN ('departure','routine','deep','arrival','commons')),
  agent_id TEXT NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  template_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  report TEXT NOT NULL DEFAULT '',
  position INTEGER CHECK(position IS NULL OR position>=0),
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id),
  review TEXT CHECK(review IS NULL OR review IN ('approved','revision')),
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK((lot_id IS NULL)<>(place_id IS NULL)),
  CHECK((status='done' AND completed_at IS NOT NULL AND completed_by IS NOT NULL) OR (status<>'done' AND completed_at IS NULL AND completed_by IS NULL)),
  FOREIGN KEY(place_id,residence_id) REFERENCES places(id,residence_id),
  UNIQUE(id,residence_id)
);
INSERT INTO cleaning_tasks(id,residence_id,lot_id,agent_id,day,status,priority,template_name,note,report,position,
  completed_at,completed_by,review,reviewed_at,reviewed_by,created_by,created_at)
SELECT id,residence_id,lot_id,agent_id,day,status,priority,template_name,note,report,position,
  completed_at,completed_by,review,reviewed_at,reviewed_by,created_by,created_at FROM cleaning_tasks_backup;
DROP TABLE cleaning_tasks_backup;

UPDATE cleaning_tasks SET type='departure' WHERE EXISTS(
  SELECT 1 FROM stays s WHERE s.lot_id=cleaning_tasks.lot_id AND s.cancelled=0 AND COALESCE(s.actual_end,s.planned_end)=cleaning_tasks.day
);

CREATE UNIQUE INDEX cleaning_task_lot_day ON cleaning_tasks(lot_id,day) WHERE status<>'cancelled' AND lot_id IS NOT NULL;
CREATE UNIQUE INDEX cleaning_task_place_day ON cleaning_tasks(place_id,day) WHERE status<>'cancelled' AND place_id IS NOT NULL;
CREATE INDEX cleaning_tasks_day ON cleaning_tasks(residence_id,day);
CREATE INDEX cleaning_tasks_completed ON cleaning_tasks(residence_id,completed_at) WHERE status='done';
CREATE INDEX cleaning_tasks_priority ON cleaning_tasks(residence_id,priority,day);
CREATE INDEX cleaning_tasks_review ON cleaning_tasks(residence_id,status,review);
CREATE INDEX cleaning_tasks_lot_status ON cleaning_tasks(lot_id,status,day);

CREATE TRIGGER cleaning_task_scope BEFORE INSERT ON cleaning_tasks BEGIN
  SELECT CASE WHEN NEW.lot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM lots WHERE id=NEW.lot_id AND residence_id=NEW.residence_id AND archived=0) THEN RAISE(ABORT,'lot_unavailable') END;
  SELECT CASE WHEN NEW.place_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM places WHERE id=NEW.place_id AND residence_id=NEW.residence_id AND archived=0) THEN RAISE(ABORT,'place_unavailable') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.agent_id AND residence_id=NEW.residence_id AND disabled=0) THEN RAISE(ABORT,'cleaning_agent') END;
END;
CREATE TRIGGER cleaning_task_agent BEFORE UPDATE OF agent_id ON cleaning_tasks WHEN NEW.agent_id<>OLD.agent_id BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.agent_id AND residence_id=NEW.residence_id AND disabled=0) THEN RAISE(ABORT,'cleaning_agent') END;
END;
CREATE TRIGGER cleaning_task_complete BEFORE UPDATE OF status ON cleaning_tasks WHEN NEW.status='done' AND OLD.status<>'done' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM cleaning_task_items WHERE task_id=NEW.id AND state='todo') THEN RAISE(ABORT,'cleaning_incomplete') END;
END;
CREATE TRIGGER cleaning_task_edit BEFORE UPDATE OF agent_id,day,note,type ON cleaning_tasks WHEN OLD.status<>'planned' BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
CREATE TRIGGER cleaning_task_priority BEFORE UPDATE OF priority ON cleaning_tasks WHEN OLD.status<>'planned' BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
CREATE TRIGGER cleaning_task_review BEFORE UPDATE OF review ON cleaning_tasks WHEN NEW.review='approved' AND NEW.status<>'done' BEGIN
  SELECT RAISE(ABORT,'cleaning_not_done');
END;
CREATE TRIGGER cleaning_task_target BEFORE UPDATE OF lot_id,place_id ON cleaning_tasks BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
CREATE TRIGGER sync_cleaning_tasks_insert AFTER INSERT ON cleaning_tasks BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_cleaning_tasks_update AFTER UPDATE ON cleaning_tasks BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_cleaning_tasks_delete AFTER DELETE ON cleaning_tasks BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(OLD.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;

CREATE TRIGGER lot_dirty_on_exit AFTER UPDATE OF actual_end ON stays
WHEN NEW.actual_end IS NOT NULL AND OLD.actual_end IS NULL AND NEW.cancelled=0 BEGIN
  UPDATE lots SET cleanliness='dirty',cleanliness_at=NEW.actual_end
  WHERE id=NEW.lot_id AND cleanliness<>'out_of_service'
    AND NOT EXISTS(SELECT 1 FROM cleaning_tasks WHERE lot_id=NEW.lot_id AND status='done' AND day>=NEW.actual_end);
END;
CREATE TRIGGER lot_clean_on_done AFTER UPDATE OF status ON cleaning_tasks
WHEN NEW.status='done' AND OLD.status<>'done' AND NEW.lot_id IS NOT NULL BEGIN
  UPDATE lots SET cleanliness='clean',cleanliness_at=NEW.completed_at WHERE id=NEW.lot_id AND cleanliness<>'out_of_service';
END;
CREATE TRIGGER lot_inspected_on_approval AFTER UPDATE OF review ON cleaning_tasks
WHEN NEW.review='approved' AND OLD.review IS NOT 'approved' AND NEW.lot_id IS NOT NULL BEGIN
  UPDATE lots SET cleanliness='inspected',cleanliness_at=NEW.reviewed_at WHERE id=NEW.lot_id AND cleanliness='clean';
END;
CREATE TRIGGER lot_dirty_on_reopen AFTER UPDATE OF status ON cleaning_tasks
WHEN OLD.status='done' AND NEW.status='planned' AND NEW.lot_id IS NOT NULL BEGIN
  UPDATE lots SET cleanliness='dirty',cleanliness_at=CASE WHEN NEW.review='revision' THEN NEW.reviewed_at ELSE cleanliness_at END
  WHERE id=NEW.lot_id AND cleanliness IN ('clean','inspected');
END;

UPDATE lots SET cleanliness='dirty',cleanliness_at=(
  SELECT MAX(s.actual_end) FROM stays s WHERE s.lot_id=lots.id AND s.cancelled=0
) WHERE archived=0 AND EXISTS(
  SELECT 1 FROM (SELECT MAX(s.actual_end) AS ended FROM stays s WHERE s.lot_id=lots.id AND s.cancelled=0) last
  WHERE last.ended IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM stays n WHERE n.lot_id=lots.id AND n.cancelled=0 AND n.actual_start IS NOT NULL AND n.actual_end IS NULL)
    AND NOT EXISTS(SELECT 1 FROM cleaning_tasks t WHERE t.lot_id=lots.id AND t.status='done' AND t.day>=last.ended)
);

ALTER TABLE issues ADD COLUMN cleaning_item_id TEXT REFERENCES cleaning_task_items(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX issues_cleaning_item ON issues(cleaning_item_id) WHERE cleaning_item_id IS NOT NULL;

ALTER TABLE stock_movements ADD COLUMN cleaning_task_id TEXT REFERENCES cleaning_tasks(id);
CREATE INDEX stock_movements_cleaning ON stock_movements(cleaning_task_id) WHERE cleaning_task_id IS NOT NULL;
