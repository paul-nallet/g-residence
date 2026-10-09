CREATE TABLE cleaning_templates (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);
CREATE UNIQUE INDEX cleaning_default_template ON cleaning_templates(residence_id) WHERE is_default=1;
CREATE TABLE cleaning_template_items (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('task','check')),
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY(template_id,residence_id) REFERENCES cleaning_templates(id,residence_id)
);
CREATE INDEX cleaning_template_items_order ON cleaning_template_items(template_id,position);
CREATE TABLE cleaning_lot_templates (
  lot_id TEXT PRIMARY KEY REFERENCES lots(id),
  residence_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  FOREIGN KEY(template_id,residence_id) REFERENCES cleaning_templates(id,residence_id)
);
CREATE INDEX cleaning_lot_templates_template ON cleaning_lot_templates(template_id);
CREATE TRIGGER cleaning_lot_template_scope BEFORE INSERT ON cleaning_lot_templates BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lots WHERE id=NEW.lot_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'lot_unavailable') END;
END;
CREATE TABLE cleaning_tasks (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  lot_id TEXT NOT NULL REFERENCES lots(id),
  agent_id TEXT NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done','cancelled')),
  template_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  report TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK((status='done' AND completed_at IS NOT NULL AND completed_by IS NOT NULL) OR (status<>'done' AND completed_at IS NULL AND completed_by IS NULL)),
  UNIQUE(id,residence_id)
);
CREATE UNIQUE INDEX cleaning_task_lot_day ON cleaning_tasks(lot_id,day) WHERE status<>'cancelled';
CREATE INDEX cleaning_tasks_day ON cleaning_tasks(residence_id,day);
CREATE TABLE cleaning_task_items (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('task','check')),
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'todo' CHECK(state IN ('todo','done','issue')),
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT,
  FOREIGN KEY(task_id,residence_id) REFERENCES cleaning_tasks(id,residence_id)
);
CREATE INDEX cleaning_task_items_order ON cleaning_task_items(task_id,position);
CREATE TRIGGER cleaning_task_scope BEFORE INSERT ON cleaning_tasks BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lots WHERE id=NEW.lot_id AND residence_id=NEW.residence_id AND archived=0) THEN RAISE(ABORT,'lot_unavailable') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.agent_id AND residence_id=NEW.residence_id AND disabled=0) THEN RAISE(ABORT,'cleaning_agent') END;
END;
CREATE TRIGGER cleaning_task_agent BEFORE UPDATE OF agent_id ON cleaning_tasks WHEN NEW.agent_id<>OLD.agent_id BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.agent_id AND residence_id=NEW.residence_id AND disabled=0) THEN RAISE(ABORT,'cleaning_agent') END;
END;
CREATE TRIGGER cleaning_task_complete BEFORE UPDATE OF status ON cleaning_tasks WHEN NEW.status='done' AND OLD.status<>'done' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM cleaning_task_items WHERE task_id=NEW.id AND state='todo') THEN RAISE(ABORT,'cleaning_incomplete') END;
END;
CREATE TRIGGER cleaning_task_edit BEFORE UPDATE OF agent_id,day,note ON cleaning_tasks WHEN OLD.status<>'planned' BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
CREATE TRIGGER cleaning_item_insert BEFORE INSERT ON cleaning_task_items WHEN (SELECT status FROM cleaning_tasks WHERE id=NEW.task_id)<>'planned' BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
CREATE TRIGGER cleaning_item_update BEFORE UPDATE ON cleaning_task_items WHEN (SELECT status FROM cleaning_tasks WHERE id=NEW.task_id)<>'planned' BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
CREATE TRIGGER cleaning_item_delete BEFORE DELETE ON cleaning_task_items WHEN (SELECT status FROM cleaning_tasks WHERE id=OLD.task_id)<>'planned' BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
