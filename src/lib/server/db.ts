import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultDbPath } from "./paths";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	prefix      TEXT NOT NULL UNIQUE,
	created_at  TEXT NOT NULL,
	archived_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks (updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks (epic_id);
`;

export function openDatabase(location: string): DatabaseSync {
	if (location !== ":memory:") {
		mkdirSync(dirname(location), { recursive: true });
	}

	const db = new DatabaseSync(location);
	db.exec("PRAGMA journal_mode = WAL;");
	db.exec("PRAGMA foreign_keys = ON;");
	db.exec(SCHEMA);
	return db;
}

let singleton: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
	singleton ??= openDatabase(defaultDbPath());
	return singleton;
}
