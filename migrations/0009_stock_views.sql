ALTER TABLE stock_categories ADD COLUMN is_view INTEGER NOT NULL DEFAULT 0 CHECK(is_view IN (0,1));
