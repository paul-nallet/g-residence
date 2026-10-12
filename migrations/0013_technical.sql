CREATE TABLE places (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  building_id TEXT REFERENCES buildings(id),
  description TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);
CREATE TRIGGER places_building_insert BEFORE INSERT ON places WHEN NEW.building_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM buildings WHERE id=NEW.building_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'building_scope') END;
END;
CREATE TRIGGER places_building_update BEFORE UPDATE OF building_id ON places WHEN NEW.building_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM buildings WHERE id=NEW.building_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'building_scope') END;
END;

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  trades TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);

CREATE TABLE works (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','in_progress','done','cancelled')),
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK(planned_start IS NULL OR planned_end IS NULL OR planned_end>=planned_start),
  CHECK(actual_end IS NULL OR (actual_start IS NOT NULL AND actual_end>=actual_start)),
  CHECK(state NOT IN ('in_progress','done') OR actual_start IS NOT NULL),
  CHECK((state='done')=(actual_end IS NOT NULL)),
  UNIQUE(id,residence_id)
);
CREATE INDEX works_state ON works(residence_id,state);

CREATE TABLE work_locations (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  lot_id TEXT REFERENCES lots(id),
  place_id TEXT,
  CHECK((lot_id IS NULL)<>(place_id IS NULL)),
  FOREIGN KEY(work_id,residence_id) REFERENCES works(id,residence_id),
  FOREIGN KEY(place_id,residence_id) REFERENCES places(id,residence_id)
);
CREATE UNIQUE INDEX work_location_lot ON work_locations(work_id,lot_id) WHERE lot_id IS NOT NULL;
CREATE UNIQUE INDEX work_location_place ON work_locations(work_id,place_id) WHERE place_id IS NOT NULL;
CREATE INDEX work_locations_lot ON work_locations(residence_id,lot_id);
CREATE TRIGGER work_location_lot_scope BEFORE INSERT ON work_locations WHEN NEW.lot_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lots WHERE id=NEW.lot_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'location_unavailable') END;
END;

CREATE TABLE work_suppliers (
  residence_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  PRIMARY KEY(work_id,supplier_id),
  FOREIGN KEY(work_id,residence_id) REFERENCES works(id,residence_id),
  FOREIGN KEY(supplier_id,residence_id) REFERENCES suppliers(id,residence_id)
);
CREATE INDEX work_suppliers_supplier ON work_suppliers(supplier_id);

CREATE TABLE work_notes (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('note','problem','status')),
  body TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY(work_id,residence_id) REFERENCES works(id,residence_id)
);
CREATE INDEX work_notes_work ON work_notes(work_id,created_at);

CREATE TABLE interventions (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  supplier_id TEXT,
  starts_at TEXT NOT NULL,
  duration INTEGER NOT NULL CHECK(duration BETWEEN 5 AND 720),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done','cancelled')),
  report TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY(work_id,residence_id) REFERENCES works(id,residence_id),
  FOREIGN KEY(supplier_id,residence_id) REFERENCES suppliers(id,residence_id)
);
CREATE INDEX interventions_time ON interventions(residence_id,starts_at);
CREATE INDEX interventions_work ON interventions(work_id,starts_at);
CREATE TRIGGER intervention_supplier_insert BEFORE INSERT ON interventions WHEN NEW.supplier_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_suppliers WHERE work_id=NEW.work_id AND supplier_id=NEW.supplier_id) THEN RAISE(ABORT,'intervention_supplier') END;
END;
CREATE TRIGGER intervention_supplier_update BEFORE UPDATE OF supplier_id ON interventions WHEN NEW.supplier_id IS NOT NULL AND NEW.supplier_id IS NOT OLD.supplier_id BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_suppliers WHERE work_id=NEW.work_id AND supplier_id=NEW.supplier_id) THEN RAISE(ABORT,'intervention_supplier') END;
END;

CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reported_on TEXT NOT NULL,
  lot_id TEXT REFERENCES lots(id),
  place_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  work_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK(lot_id IS NULL OR place_id IS NULL),
  FOREIGN KEY(place_id,residence_id) REFERENCES places(id,residence_id),
  FOREIGN KEY(work_id,residence_id) REFERENCES works(id,residence_id)
);
CREATE INDEX issues_status ON issues(residence_id,status,reported_on);
CREATE INDEX issues_work ON issues(work_id);
CREATE TRIGGER issue_lot_scope_insert BEFORE INSERT ON issues WHEN NEW.lot_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lots WHERE id=NEW.lot_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'location_unavailable') END;
END;
CREATE TRIGGER issue_lot_scope_update BEFORE UPDATE OF lot_id ON issues WHEN NEW.lot_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lots WHERE id=NEW.lot_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'location_unavailable') END;
END;

CREATE TABLE technical_changes (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('place','supplier','issue','work','intervention')),
  entity_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX technical_changes_entity ON technical_changes(entity,entity_id);
