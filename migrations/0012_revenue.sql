CREATE TABLE revenue_sources (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);
CREATE TABLE revenue_source_changes (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES revenue_sources(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE revenue_entries (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(period,6,2) BETWEEN '01' AND '12'),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>=0 AND amount_cents<=100000000000),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency='EUR'),
  comment TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE(source_id,period),
  FOREIGN KEY(source_id,residence_id) REFERENCES revenue_sources(id,residence_id)
);
CREATE INDEX revenue_entries_period ON revenue_entries(residence_id,period);
CREATE TABLE revenue_entry_changes (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  entry_id TEXT NOT NULL REFERENCES revenue_entries(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
