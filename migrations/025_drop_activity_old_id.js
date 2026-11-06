export const up = (db) => {
	db.exec(`
DELETE FROM activity WHERE entity = 'task' AND entity_task_id IS NULL;
ALTER TABLE activity DROP COLUMN old_id;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE activity ADD COLUMN old_id TEXT;
`);
};
