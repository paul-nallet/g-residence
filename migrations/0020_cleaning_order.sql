ALTER TABLE cleaning_tasks ADD COLUMN position INTEGER CHECK(position IS NULL OR position>=0);
