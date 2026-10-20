export const up = (db) => {
	db.exec(`
CREATE TABLE task_comments (
	id         TEXT PRIMARY KEY,
	task_id    TEXT NOT NULL REFERENCES tasks (id) ON UPDATE CASCADE ON DELETE CASCADE,
	body       TEXT NOT NULL,
	created_at TEXT NOT NULL,
	edited_at  TEXT,
	deleted_at TEXT
);

CREATE INDEX idx_task_comments_task ON task_comments (task_id, created_at);
CREATE INDEX idx_task_comments_deleted ON task_comments (deleted_at);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_task_comments_deleted;
DROP INDEX IF EXISTS idx_task_comments_task;
DROP TABLE IF EXISTS task_comments;
`);
};
