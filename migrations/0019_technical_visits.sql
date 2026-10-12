CREATE TABLE visit_templates (
  id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id),
  building_id TEXT NOT NULL REFERENCES buildings(id), name TEXT NOT NULL COLLATE NOCASE,
  frequency TEXT NOT NULL CHECK(frequency IN ('weekly','monthly','quarterly','once')),
  first_due TEXT, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  points_json TEXT NOT NULL, UNIQUE(residence_id,building_id,name), UNIQUE(id,residence_id),
  CHECK(frequency='once' OR first_due IS NOT NULL)
);
CREATE INDEX visit_templates_scope ON visit_templates(residence_id,archived,building_id);
CREATE TRIGGER visit_template_scope BEFORE INSERT ON visit_templates BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM buildings WHERE id=NEW.building_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'visit_scope') END;
END;
CREATE TRIGGER visit_template_scope_update BEFORE UPDATE ON visit_templates BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM buildings WHERE id=NEW.building_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'visit_scope') END;
END;
CREATE TABLE technical_visits (
  id TEXT PRIMARY KEY, residence_id TEXT NOT NULL, template_id TEXT NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id), name TEXT NOT NULL, frequency TEXT NOT NULL,
  scheduled_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done','cancelled')),
  completed_on TEXT, completed_by TEXT REFERENCES users(id), report TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  FOREIGN KEY(template_id,residence_id) REFERENCES visit_templates(id,residence_id), UNIQUE(id,residence_id),
  CHECK((status='done')=(completed_on IS NOT NULL)), CHECK((status='done')=(completed_by IS NOT NULL))
);
CREATE UNIQUE INDEX visit_one_planned ON technical_visits(template_id) WHERE status='planned';
CREATE INDEX visit_scope_date ON technical_visits(residence_id,status,scheduled_on);
CREATE INDEX visit_building ON technical_visits(residence_id,building_id,scheduled_on);
CREATE INDEX visit_last_done ON technical_visits(template_id,status,completed_on);
CREATE INDEX visit_report ON technical_visits(residence_id,completed_on) WHERE status='done';
CREATE TABLE visit_points (
  id TEXT PRIMARY KEY, residence_id TEXT NOT NULL, visit_id TEXT NOT NULL,
  position INTEGER NOT NULL, zone TEXT NOT NULL, label TEXT NOT NULL, location TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ok','issue','not_verified')),
  note TEXT NOT NULL DEFAULT '', actor_id TEXT REFERENCES users(id), checked_at TEXT, issue_id TEXT REFERENCES issues(id),
  FOREIGN KEY(visit_id,residence_id) REFERENCES technical_visits(id,residence_id),
  UNIQUE(visit_id,position), UNIQUE(issue_id)
);
CREATE TRIGGER visit_point_locked BEFORE UPDATE OF state,note ON visit_points BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM technical_visits WHERE id=OLD.visit_id AND status='planned') OR OLD.issue_id IS NOT NULL THEN RAISE(ABORT,'visit_locked') END;
END;
CREATE TRIGGER visit_closed BEFORE UPDATE ON technical_visits WHEN OLD.status<>'planned' BEGIN
  SELECT RAISE(ABORT,'visit_locked');
END;
CREATE TRIGGER visit_finish_check BEFORE UPDATE OF status ON technical_visits WHEN NEW.status='done' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM visit_points WHERE visit_id=NEW.id AND (state='pending' OR (state IN ('issue','not_verified') AND trim(note)=''))) THEN RAISE(ABORT,'visit_incomplete') END;
END;
CREATE TABLE visit_changes (
  id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), entity_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id), before_json TEXT, after_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX visit_changes_entity ON visit_changes(residence_id,entity_id,created_at);
CREATE TRIGGER sync_visit_templates_insert AFTER INSERT ON visit_templates BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_visit_templates_update AFTER UPDATE ON visit_templates BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_visit_templates_delete AFTER DELETE ON visit_templates BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(OLD.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_technical_visits_insert AFTER INSERT ON technical_visits BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_technical_visits_update AFTER UPDATE ON technical_visits BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_technical_visits_delete AFTER DELETE ON technical_visits BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(OLD.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_visit_points_insert AFTER INSERT ON visit_points BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_visit_points_update AFTER UPDATE ON visit_points BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_visit_points_delete AFTER DELETE ON visit_points BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(OLD.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER visit_issue_link BEFORE UPDATE OF issue_id ON visit_points BEGIN
  SELECT CASE WHEN OLD.issue_id IS NOT NULL OR OLD.state<>'issue' OR NOT EXISTS(SELECT 1 FROM technical_visits WHERE id=OLD.visit_id AND status='done') THEN RAISE(ABORT,'visit_locked') END;
END;
CREATE TRIGGER sync_visit_changes_insert AFTER INSERT ON visit_changes BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_visit_changes_update AFTER UPDATE ON visit_changes BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_visit_changes_delete AFTER DELETE ON visit_changes BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(OLD.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
