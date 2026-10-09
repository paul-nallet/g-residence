CREATE TABLE stock_categories (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);
CREATE TABLE stock_item_categories (
  residence_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY(item_id,category_id),
  FOREIGN KEY(item_id,residence_id) REFERENCES stock_items(id,residence_id),
  FOREIGN KEY(category_id,residence_id) REFERENCES stock_categories(id,residence_id)
);
CREATE INDEX stock_item_categories_category ON stock_item_categories(residence_id,category_id);
INSERT INTO stock_categories(id,residence_id,name)
SELECT lower(hex(randomblob(16))),residence_id,category FROM stock_items WHERE category<>'' GROUP BY residence_id,category;
INSERT INTO stock_item_categories(residence_id,item_id,category_id)
SELECT i.residence_id,i.id,c.id FROM stock_items i JOIN stock_categories c ON c.residence_id=i.residence_id AND c.name=i.category;
DROP INDEX stock_items_category;
ALTER TABLE stock_items DROP COLUMN category;
