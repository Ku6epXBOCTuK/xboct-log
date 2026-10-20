export const up = (db) => {
	db.exec(`
CREATE TABLE task_blocked_by (
	blocked_task_id TEXT NOT NULL REFERENCES tasks (id),
	blocked_by_task_id TEXT NOT NULL REFERENCES tasks (id),
	created_at TEXT NOT NULL,
	PRIMARY KEY (blocked_task_id, blocked_by_task_id),
	CHECK (blocked_task_id <> blocked_by_task_id)
);

CREATE INDEX idx_task_blocked_by_blocker ON task_blocked_by (blocked_by_task_id);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_task_blocked_by_blocker;
DROP TABLE IF EXISTS task_blocked_by;
`);
};
