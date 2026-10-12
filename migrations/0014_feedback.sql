CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL REFERENCES residences(id),
  kind TEXT NOT NULL CHECK(kind IN ('idea','feature','bug')),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 2000),
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX feedback_recent ON feedback(residence_id,created_at DESC);
