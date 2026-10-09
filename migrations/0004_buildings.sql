CREATE TABLE buildings (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(name)) BETWEEN 1 AND 80),
  UNIQUE(residence_id,name)
);
ALTER TABLE lots ADD COLUMN building_id TEXT REFERENCES buildings(id);
CREATE INDEX lots_building ON lots(residence_id,building_id);
CREATE TRIGGER lots_building_insert BEFORE INSERT ON lots WHEN NEW.building_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM buildings WHERE id=NEW.building_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'building_scope') END;
END;
CREATE TRIGGER lots_building_update BEFORE UPDATE OF building_id,residence_id ON lots WHEN NEW.building_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM buildings WHERE id=NEW.building_id AND residence_id=NEW.residence_id) THEN RAISE(ABORT,'building_scope') END;
END;
