CREATE TABLE residences (id TEXT PRIMARY KEY, name TEXT NOT NULL, singleton INTEGER NOT NULL UNIQUE DEFAULT 1 CHECK(singleton=1));
CREATE TABLE users (id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','cleaner')), password_hash TEXT NOT NULL, salt TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE invitations (id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), email TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('admin','manager','cleaner')), hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT);
CREATE UNIQUE INDEX pending_invitation ON invitations(email) WHERE used_at IS NULL;
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until_at TEXT NOT NULL);
CREATE TABLE lots (id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), number TEXT NOT NULL COLLATE NOCASE, floor TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0, UNIQUE(residence_id,number));
CREATE TABLE stays (id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), lot_id TEXT NOT NULL REFERENCES lots(id), first_name TEXT NOT NULL, last_name TEXT NOT NULL, planned_start TEXT NOT NULL, planned_end TEXT, actual_start TEXT, actual_end TEXT, cancelled INTEGER NOT NULL DEFAULT 0, CHECK(planned_end IS NULL OR planned_end>planned_start), CHECK(actual_end IS NULL OR (actual_start IS NOT NULL AND actual_end>=actual_start)), CHECK(COALESCE(actual_end,planned_end,'9999-12-31')>=COALESCE(actual_start,planned_start)));
CREATE INDEX stays_lot ON stays(residence_id,lot_id);
CREATE TABLE notices (id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), stay_id TEXT NOT NULL REFERENCES stays(id), received_on TEXT NOT NULL, departure_on TEXT NOT NULL, previous_end TEXT, comment TEXT NOT NULL DEFAULT '', withdrawn INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX active_notice ON notices(stay_id) WHERE withdrawn=0;
CREATE TABLE inspections (id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), stay_id TEXT NOT NULL REFERENCES stays(id), kind TEXT NOT NULL CHECK(kind IN ('entry','exit')), starts_at TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration BETWEEN 5 AND 480), status TEXT NOT NULL CHECK(status IN ('planned','done','cancelled')), completed_on TEXT, comment TEXT NOT NULL DEFAULT '', CHECK((status='done' AND completed_on IS NOT NULL) OR (status<>'done' AND completed_on IS NULL)));
CREATE INDEX inspections_time ON inspections(residence_id,starts_at);
CREATE TABLE history (id TEXT PRIMARY KEY, residence_id TEXT NOT NULL REFERENCES residences(id), lot_id TEXT REFERENCES lots(id), actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX history_lot ON history(residence_id,lot_id,created_at);
CREATE TRIGGER stays_scope_insert BEFORE INSERT ON stays BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lots WHERE id=NEW.lot_id AND residence_id=NEW.residence_id AND archived=0) THEN RAISE(ABORT,'lot_unavailable') END;
END;
CREATE TRIGGER stays_overlap_insert BEFORE INSERT ON stays WHEN NEW.cancelled=0 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM stays s WHERE s.lot_id=NEW.lot_id AND s.cancelled=0 AND COALESCE(s.actual_start,s.planned_start)<COALESCE(NEW.actual_end,NEW.planned_end,'9999-12-31') AND COALESCE(NEW.actual_start,NEW.planned_start)<COALESCE(s.actual_end,s.planned_end,'9999-12-31')) THEN RAISE(ABORT,'stay_overlap') END;
END;
CREATE TRIGGER stays_overlap_update BEFORE UPDATE ON stays WHEN NEW.cancelled=0 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM stays s WHERE s.lot_id=NEW.lot_id AND s.id<>NEW.id AND s.cancelled=0 AND COALESCE(s.actual_start,s.planned_start)<COALESCE(NEW.actual_end,NEW.planned_end,'9999-12-31') AND COALESCE(NEW.actual_start,NEW.planned_start)<COALESCE(s.actual_end,s.planned_end,'9999-12-31')) THEN RAISE(ABORT,'stay_overlap') END;
END;
CREATE TRIGGER protect_last_admin BEFORE UPDATE OF disabled,role ON users WHEN OLD.role='admin' AND OLD.disabled=0 AND (NEW.role<>'admin' OR NEW.disabled<>0) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE role='admin' AND disabled=0 AND id<>OLD.id) THEN RAISE(ABORT,'last_admin') END;
END;
