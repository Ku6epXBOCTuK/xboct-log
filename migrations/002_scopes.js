export const up = (db) => {
	db.exec(`
CREATE TABLE scopes (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id TEXT NOT NULL REFERENCES projects (id),
	name       TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (project_id, name)
);

ALTER TABLE tasks ADD COLUMN scope_id INTEGER REFERENCES scopes (id) ON DELETE SET NULL;

CREATE INDEX idx_scopes_project ON scopes (project_id);
CREATE INDEX idx_tasks_scope ON tasks (scope_id);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_tasks_scope;
DROP INDEX IF EXISTS idx_scopes_project;
ALTER TABLE tasks DROP COLUMN scope_id;
DROP TABLE IF EXISTS scopes;
`);
};
