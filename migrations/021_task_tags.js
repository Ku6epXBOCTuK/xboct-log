export const up = (db) => {
	db.exec(`
CREATE TABLE task_tags (
	task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	tag TEXT NOT NULL REFERENCES tags (name) ON UPDATE CASCADE,
	PRIMARY KEY (task_id, tag)
) WITHOUT ROWID;
CREATE INDEX idx_task_tags_tag ON task_tags (tag);
INSERT OR IGNORE INTO task_tags (task_id, tag)
SELECT tasks.id, je.value
FROM tasks, json_each(tasks.tags) AS je
WHERE je.value <> '';
`);

	db.exec(`
ALTER TABLE tasks DROP COLUMN tags;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
UPDATE tasks
SET tags = (
	SELECT json_group_array(tag)
	FROM task_tags
	WHERE task_tags.task_id = tasks.id
);
DROP TABLE task_tags;
`);
};
