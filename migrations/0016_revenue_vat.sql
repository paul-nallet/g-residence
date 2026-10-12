ALTER TABLE revenue_sources ADD COLUMN vat_mode TEXT NOT NULL DEFAULT 'ttc' CHECK(vat_mode IN ('ttc','ht'));
ALTER TABLE revenue_sources ADD COLUMN vat_rate INTEGER DEFAULT 2000 CHECK((vat_mode='ttc' AND vat_rate IN (0,210,550,1000,2000)) OR (vat_mode='ht' AND vat_rate IS NULL));
ALTER TABLE revenue_entries ADD COLUMN vat_mode TEXT NOT NULL DEFAULT 'ttc';
ALTER TABLE revenue_entries ADD COLUMN vat_rate INTEGER;
ALTER TABLE revenue_entries ADD COLUMN net_cents INTEGER;
ALTER TABLE revenue_entries ADD COLUMN vat_cents INTEGER;
UPDATE revenue_entries SET vat_rate=(SELECT s.vat_rate FROM revenue_sources s WHERE s.id=revenue_entries.source_id);
UPDATE revenue_entries SET net_cents=(2*amount_cents*10000+10000+vat_rate)/(2*(10000+vat_rate));
UPDATE revenue_entries SET vat_cents=amount_cents-net_cents;
CREATE TRIGGER revenue_entries_vat_insert BEFORE INSERT ON revenue_entries BEGIN
 SELECT CASE WHEN NOT (
  (NEW.vat_mode='ttc' AND NEW.vat_rate IN (0,210,550,1000,2000) AND NEW.net_cents=(2*NEW.amount_cents*10000+10000+NEW.vat_rate)/(2*(10000+NEW.vat_rate)) AND NEW.vat_cents=NEW.amount_cents-NEW.net_cents)
  OR (NEW.vat_mode='ht' AND NEW.vat_rate IS NULL AND NEW.net_cents=NEW.amount_cents AND NEW.vat_cents IS NULL)
 ) THEN RAISE(ABORT,'revenue_vat_invalid') END;
END;
CREATE TRIGGER revenue_entries_vat_update BEFORE UPDATE ON revenue_entries BEGIN
 SELECT CASE WHEN NOT (
  (NEW.vat_mode='ttc' AND NEW.vat_rate IN (0,210,550,1000,2000) AND NEW.net_cents=(2*NEW.amount_cents*10000+10000+NEW.vat_rate)/(2*(10000+NEW.vat_rate)) AND NEW.vat_cents=NEW.amount_cents-NEW.net_cents)
  OR (NEW.vat_mode='ht' AND NEW.vat_rate IS NULL AND NEW.net_cents=NEW.amount_cents AND NEW.vat_cents IS NULL)
 ) THEN RAISE(ABORT,'revenue_vat_invalid') END;
END;
