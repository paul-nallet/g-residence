CREATE TRIGGER archive_open_stays BEFORE UPDATE OF archived ON lots WHEN NEW.archived=1 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM stays WHERE lot_id=NEW.id AND cancelled=0 AND actual_end IS NULL) THEN RAISE(ABORT,'lot_unavailable') END;
END;
CREATE TRIGGER cancelled_stay_insert BEFORE INSERT ON stays WHEN NEW.cancelled=1 AND NEW.actual_start IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'stay_started');
END;
CREATE TRIGGER cancelled_stay_update BEFORE UPDATE ON stays WHEN NEW.cancelled=1 AND NEW.actual_start IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'stay_started');
END;
