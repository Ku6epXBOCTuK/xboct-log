export const up = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_tasks_deleted ON tasks (deleted_at);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_tasks_deleted;
ALTER TABLE tasks DROP COLUMN deleted_at;
`);
};
