CREATE UNIQUE INDEX single_active_occupant ON stays(lot_id) WHERE cancelled=0 AND actual_start IS NOT NULL AND actual_end IS NULL;
