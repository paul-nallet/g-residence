ALTER TABLE cleaning_tasks ADD COLUMN review TEXT CHECK(review IS NULL OR review IN ('approved','revision'));
ALTER TABLE cleaning_tasks ADD COLUMN reviewed_at TEXT;
ALTER TABLE cleaning_tasks ADD COLUMN reviewed_by TEXT REFERENCES users(id);
CREATE INDEX cleaning_tasks_review ON cleaning_tasks(residence_id,status,review);
CREATE TRIGGER cleaning_task_review BEFORE UPDATE OF review ON cleaning_tasks WHEN NEW.review='approved' AND NEW.status<>'done' BEGIN
  SELECT RAISE(ABORT,'cleaning_not_done');
END;
CREATE TABLE cleaning_task_comments (
  id TEXT PRIMARY KEY,
  residence_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('note','approved','revision')),
  body TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id,residence_id) REFERENCES cleaning_tasks(id,residence_id)
);
CREATE INDEX cleaning_task_comments_task ON cleaning_task_comments(task_id,created_at);
CREATE INDEX cleaning_task_comments_review ON cleaning_task_comments(residence_id,kind,created_at);
CREATE TRIGGER cleaning_comment_insert BEFORE INSERT ON cleaning_task_comments
WHEN (SELECT status FROM cleaning_tasks WHERE id=NEW.task_id)='cancelled' BEGIN
  SELECT RAISE(ABORT,'cleaning_cancelled');
END;
CREATE TRIGGER sync_cleaning_task_comments_insert AFTER INSERT ON cleaning_task_comments BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_cleaning_task_comments_update AFTER UPDATE ON cleaning_task_comments BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(NEW.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
CREATE TRIGGER sync_cleaning_task_comments_delete AFTER DELETE ON cleaning_task_comments BEGIN INSERT INTO residence_sync(residence_id,version) VALUES(OLD.residence_id,1) ON CONFLICT(residence_id) DO UPDATE SET version=version+1; END;
