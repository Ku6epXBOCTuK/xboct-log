export const up = (db) => {
	db.exec(`
ALTER TABLE task_attachments ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_task_attachments_deleted ON task_attachments(deleted_at);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_task_attachments_deleted;
ALTER TABLE task_attachments DROP COLUMN deleted_at;
`);
};
