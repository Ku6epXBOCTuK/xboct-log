export const up = (db) => {
	db.exec(`
CREATE TABLE task_revisions (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	task_id    TEXT NOT NULL REFERENCES tasks (id) ON UPDATE CASCADE ON DELETE CASCADE,
	field      TEXT NOT NULL,
	ref_id     TEXT,
	body       TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX idx_task_revisions_task ON task_revisions (task_id, created_at);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_task_revisions_task;
DROP TABLE IF EXISTS task_revisions;
`);
};
