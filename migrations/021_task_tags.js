const TAG_NAME_MAX_LENGTH = 20;

// NOTE: keep in sync with 020, the renamed names must match the rows it
// inserted into tags, otherwise the foreign key rejects the whole link.
function renameTag(raw) {
	const name = String(raw)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^[^a-z0-9]+/, "")
		.slice(0, TAG_NAME_MAX_LENGTH)
		.replace(/[-_]+$/, "");
	return name === "" ? null : name;
}

export const up = (db) => {
	db.exec(`
CREATE TABLE task_tags (
	task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	tag TEXT NOT NULL REFERENCES tags (name) ON UPDATE CASCADE,
	PRIMARY KEY (task_id, tag)
) WITHOUT ROWID;
CREATE INDEX idx_task_tags_tag ON task_tags (tag);
`);
	db.function("TAG_NAME", { deterministic: true }, (value) =>
		value == null ? null : renameTag(value),
	);
	db.exec(`
INSERT OR IGNORE INTO task_tags (task_id, tag)
SELECT tasks.id, TAG_NAME(je.value)
FROM tasks, json_each(tasks.tags) AS je
WHERE je.value <> '' AND TAG_NAME(je.value) IS NOT NULL;
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
