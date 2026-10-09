CREATE TABLE stock_views (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);
CREATE TABLE stock_view_categories (
  residence_id TEXT NOT NULL,
  view_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY(view_id,category_id),
  FOREIGN KEY(view_id,residence_id) REFERENCES stock_views(id,residence_id),
  FOREIGN KEY(category_id,residence_id) REFERENCES stock_categories(id,residence_id)
);
INSERT INTO stock_views(id,residence_id,name) SELECT id,residence_id,name FROM stock_categories WHERE is_view=1;
INSERT INTO stock_view_categories(residence_id,view_id,category_id) SELECT residence_id,id,id FROM stock_categories WHERE is_view=1;
ALTER TABLE stock_categories DROP COLUMN is_view;
