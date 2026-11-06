export const up = (db) => {
	db.exec(`
ALTER TABLE activity ADD COLUMN entity_task_id TEXT;

UPDATE activity
SET entity_task_id = (SELECT id FROM tasks WHERE key = activity.entity_id)
WHERE entity = 'task';

CREATE INDEX idx_activity_entity_task ON activity (entity_task_id, id);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_activity_entity_task;
ALTER TABLE activity DROP COLUMN entity_task_id;
`);
};
