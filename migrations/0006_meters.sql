CREATE TABLE meters (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  name TEXT NOT NULL COLLATE NOCASE,
  location TEXT NOT NULL,
  reference TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('water','electricity','gas')),
  unit TEXT NOT NULL CHECK((kind='water' AND unit='m3') OR (kind='electricity' AND unit='kWh') OR (kind='gas' AND unit IN ('m3','kWh'))),
  UNIQUE(residence_id,name),
  UNIQUE(id,residence_id)
);
CREATE TABLE meter_readings (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  meter_id TEXT NOT NULL,
  observed_on TEXT NOT NULL,
  value REAL NOT NULL CHECK(value>=0 AND value<=1000000000000),
  actor_id TEXT NOT NULL REFERENCES users(id),
  UNIQUE(meter_id,observed_on),
  FOREIGN KEY(meter_id,residence_id) REFERENCES meters(id,residence_id)
);
CREATE INDEX meter_readings_history ON meter_readings(residence_id,meter_id,observed_on DESC);
CREATE TABLE meter_reading_changes (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  reading_id TEXT NOT NULL REFERENCES meter_readings(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
