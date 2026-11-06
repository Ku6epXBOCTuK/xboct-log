import { randomUUID } from "node:crypto";

function foreignKeyViolations(db) {
	return db.prepare("PRAGMA foreign_key_check").all();
}

export const up = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN key TEXT;
UPDATE tasks SET key = id;
`);

	const tasks = db.prepare("SELECT id FROM tasks").all();
	if (tasks.length > 0) {
		const violationsBefore = foreignKeyViolations(db).length;

		// NOTE: the migrator runs every migration inside one transaction, so
		// foreign keys have to be deferred instead of switched off.
		db.exec("PRAGMA defer_foreign_keys = ON;");
		db.exec(
			"CREATE TEMP TABLE task_identity_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);",
		);
		const insert = db.prepare(
			"INSERT INTO task_identity_map (old_id, new_id) VALUES (?, ?)",
		);
		for (const task of tasks) {
			insert.run(String(task.id), randomUUID());
		}

		db.exec(`
UPDATE task_links
SET source_task_id = (SELECT new_id FROM task_identity_map WHERE old_id = task_links.source_task_id)
WHERE source_task_id IN (SELECT old_id FROM task_identity_map);

UPDATE task_links
SET target_task_id = (SELECT new_id FROM task_identity_map WHERE old_id = task_links.target_task_id)
WHERE target_task_id IN (SELECT old_id FROM task_identity_map);

UPDATE task_comments
SET task_id = (SELECT new_id FROM task_identity_map WHERE old_id = task_comments.task_id)
WHERE task_id IN (SELECT old_id FROM task_identity_map);

UPDATE task_revisions
SET task_id = (SELECT new_id FROM task_identity_map WHERE old_id = task_revisions.task_id)
WHERE task_id IN (SELECT old_id FROM task_identity_map);

UPDATE task_attachments
SET task_id = (SELECT new_id FROM task_identity_map WHERE old_id = task_attachments.task_id)
WHERE task_id IN (SELECT old_id FROM task_identity_map);

UPDATE task_tags
SET task_id = (SELECT new_id FROM task_identity_map WHERE old_id = task_tags.task_id)
WHERE task_id IN (SELECT old_id FROM task_identity_map);

UPDATE tasks
SET epic_id = (SELECT new_id FROM task_identity_map WHERE old_id = tasks.epic_id)
WHERE epic_id IN (SELECT old_id FROM task_identity_map);

UPDATE tasks
SET id = (SELECT new_id FROM task_identity_map WHERE old_id = tasks.id)
WHERE id IN (SELECT old_id FROM task_identity_map);
`);

		db.exec("DROP TABLE task_identity_map;");

		if (foreignKeyViolations(db).length > violationsBefore) {
			throw new Error("foreign key check failed after task identity rewrite");
		}
	}

	db.exec("CREATE UNIQUE INDEX idx_tasks_key ON tasks (key);");
};

export const down = (db) => {
	db.exec(`
CREATE TEMP TABLE task_identity_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
INSERT INTO task_identity_map (old_id, new_id) SELECT key, id FROM tasks;

PRAGMA defer_foreign_keys = ON;

UPDATE task_links
SET source_task_id = (SELECT old_id FROM task_identity_map WHERE new_id = task_links.source_task_id)
WHERE source_task_id IN (SELECT new_id FROM task_identity_map);

UPDATE task_links
SET target_task_id = (SELECT old_id FROM task_identity_map WHERE new_id = task_links.target_task_id)
WHERE target_task_id IN (SELECT new_id FROM task_identity_map);

UPDATE task_comments
SET task_id = (SELECT old_id FROM task_identity_map WHERE new_id = task_comments.task_id)
WHERE task_id IN (SELECT new_id FROM task_identity_map);

UPDATE task_revisions
SET task_id = (SELECT old_id FROM task_identity_map WHERE new_id = task_revisions.task_id)
WHERE task_id IN (SELECT new_id FROM task_identity_map);

UPDATE task_attachments
SET task_id = (SELECT old_id FROM task_identity_map WHERE new_id = task_attachments.task_id)
WHERE task_id IN (SELECT new_id FROM task_identity_map);

UPDATE task_tags
SET task_id = (SELECT old_id FROM task_identity_map WHERE new_id = task_tags.task_id)
WHERE task_id IN (SELECT new_id FROM task_identity_map);

UPDATE tasks
SET epic_id = (SELECT old_id FROM task_identity_map WHERE new_id = tasks.epic_id)
WHERE epic_id IN (SELECT new_id FROM task_identity_map);

UPDATE tasks SET id = key;

DROP TABLE task_identity_map;
DROP INDEX IF EXISTS idx_tasks_key;
ALTER TABLE tasks DROP COLUMN key;
`);
};
