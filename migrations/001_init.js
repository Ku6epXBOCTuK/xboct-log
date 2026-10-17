export const up = (db) => {
	db.exec(`
CREATE TABLE projects (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	prefix      TEXT NOT NULL UNIQUE,
	created_at  TEXT NOT NULL,
	archived_at TEXT
);

CREATE TABLE tasks (
	id          TEXT PRIMARY KEY,
	project_id  TEXT NOT NULL REFERENCES projects (id),
	number      INTEGER NOT NULL,
	title       TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	status      TEXT NOT NULL,
	priority    TEXT NOT NULL,
	is_epic     INTEGER NOT NULL DEFAULT 0,
	epic_id     TEXT REFERENCES tasks (id),
	source_file TEXT,
	source_line INTEGER,
	tags        TEXT NOT NULL DEFAULT '[]',
	created_at  TEXT NOT NULL,
	updated_at  TEXT NOT NULL,
	closed_at   TEXT,
	closed_reason TEXT,
	UNIQUE (project_id, number)
);

CREATE TABLE task_number_high_water (
	project_id  TEXT PRIMARY KEY REFERENCES projects (id),
	last_number INTEGER NOT NULL
);

CREATE INDEX idx_tasks_project ON tasks (project_id);
CREATE INDEX idx_tasks_status ON tasks (status);
CREATE INDEX idx_tasks_updated ON tasks (updated_at);
CREATE INDEX idx_tasks_epic ON tasks (epic_id);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_tasks_epic;
DROP INDEX IF EXISTS idx_tasks_updated;
DROP INDEX IF EXISTS idx_tasks_status;
DROP INDEX IF EXISTS idx_tasks_project;
DROP TABLE IF EXISTS task_number_high_water;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS projects;
`);
};
