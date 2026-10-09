INSERT INTO buildings(id,residence_id,name)
SELECT 'building-a-' || r.id,r.id,'Bâtiment A' FROM residences r
WHERE EXISTS(SELECT 1 FROM lots WHERE residence_id=r.id AND building_id IS NULL)
AND NOT EXISTS(SELECT 1 FROM buildings WHERE residence_id=r.id AND name='Bâtiment A' COLLATE NOCASE);
UPDATE lots SET building_id=(SELECT id FROM buildings WHERE residence_id=lots.residence_id AND name='Bâtiment A' COLLATE NOCASE)
WHERE building_id IS NULL;
CREATE TRIGGER lots_building_required_insert BEFORE INSERT ON lots WHEN NEW.building_id IS NULL OR length(trim(NEW.building_id))=0 BEGIN
  SELECT RAISE(ABORT,'building_required');
END;
CREATE TRIGGER lots_building_required_update BEFORE UPDATE ON lots WHEN NEW.building_id IS NULL OR length(trim(NEW.building_id))=0 BEGIN
  SELECT RAISE(ABORT,'building_required');
END;
