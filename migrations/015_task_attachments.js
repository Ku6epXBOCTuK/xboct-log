export const up = (db) => {
	db.exec(`
CREATE TABLE IF NOT EXISTS task_attachments (
	id TEXT PRIMARY KEY,
	task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
	file_name TEXT NOT NULL,
	mime_type TEXT,
	size INTEGER NOT NULL,
	stored_name TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
`);
};

export const down = (db) => {
	db.exec(`
DROP TABLE IF EXISTS task_attachments;
`);
};
