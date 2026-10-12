ALTER TABLE issues ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent'));
ALTER TABLE works ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent'));
ALTER TABLE cleaning_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent'));
CREATE INDEX issues_priority ON issues(residence_id,priority,status,reported_on);
CREATE INDEX works_priority ON works(residence_id,priority,state);
CREATE INDEX cleaning_tasks_priority ON cleaning_tasks(residence_id,priority,day);
CREATE TRIGGER cleaning_task_priority BEFORE UPDATE OF priority ON cleaning_tasks WHEN OLD.status<>'planned' BEGIN
  SELECT RAISE(ABORT,'cleaning_locked');
END;
