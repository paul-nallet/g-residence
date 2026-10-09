CREATE TABLE stock_items (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  category TEXT NOT NULL COLLATE NOCASE,
  unit TEXT NOT NULL,
  threshold INTEGER NOT NULL CHECK(threshold>=0 AND threshold<=1000000),
  quantity INTEGER NOT NULL DEFAULT 0 CONSTRAINT stock_not_negative CHECK(quantity>=0 AND quantity<=1000000),
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);
CREATE INDEX stock_items_category ON stock_items(residence_id,category);
CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('in','out','count')),
  delta INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL CONSTRAINT stock_not_negative CHECK(quantity_after>=0 AND quantity_after<=1000000),
  occurred_on TEXT NOT NULL,
  comment TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY(item_id,residence_id) REFERENCES stock_items(id,residence_id)
);
CREATE INDEX stock_movements_history ON stock_movements(residence_id,item_id);
CREATE TABLE stock_item_changes (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES stock_items(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
