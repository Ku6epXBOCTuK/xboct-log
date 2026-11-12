CREATE TABLE activity (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT NOT NULL,
	source     TEXT NOT NULL,
	op         TEXT NOT NULL,
	entity     TEXT NOT NULL,
	entity_id  TEXT NOT NULL,
	fields     TEXT NOT NULL DEFAULT '[]'
, changes TEXT NOT NULL DEFAULT '[]', client TEXT, entity_task_id TEXT);

CREATE TABLE projects (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	prefix      TEXT NOT NULL UNIQUE,
	created_at  TEXT NOT NULL,
	archived_at TEXT
, repo TEXT);

CREATE TABLE schema_migrations (
          name TEXT PRIMARY KEY,
          executed_at TEXT NOT NULL,
          batch INTEGER NOT NULL
        );

CREATE TABLE schema_migrations_lock (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          locked INTEGER NOT NULL DEFAULT 0
        );

CREATE TABLE scopes (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id TEXT NOT NULL REFERENCES projects (id),
	name       TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (project_id, name)
);

CREATE TABLE tags (
	name TEXT PRIMARY KEY CHECK (
		name <> ''
		AND length(name) <= 20
		AND name GLOB '[a-z0-9]*'
		AND name NOT GLOB '*[^a-z0-9_-]*'
	),
	archived INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);

CREATE TABLE task_attachments (
	id TEXT PRIMARY KEY,
	task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
	file_name TEXT NOT NULL,
	mime_type TEXT,
	size INTEGER NOT NULL,
	stored_name TEXT NOT NULL,
	created_at TEXT NOT NULL
, deleted_at TEXT);

CREATE TABLE task_comments (
	id         TEXT PRIMARY KEY,
	task_id    TEXT NOT NULL REFERENCES tasks (id) ON UPDATE CASCADE ON DELETE CASCADE,
	body       TEXT NOT NULL,
	created_at TEXT NOT NULL,
	edited_at  TEXT,
	deleted_at TEXT
);

CREATE TABLE task_links (
	source_task_id TEXT NOT NULL REFERENCES tasks (id),
	target_task_id TEXT NOT NULL REFERENCES tasks (id),
	link_type TEXT NOT NULL CHECK (
		link_type IN ('blocks', 'relates_to', 'duplicates')
	),
	created_at TEXT NOT NULL,
	PRIMARY KEY (source_task_id, target_task_id, link_type),
	CHECK (source_task_id <> target_task_id)
);

CREATE TABLE task_number_high_water (
	project_id  TEXT PRIMARY KEY REFERENCES projects (id),
	last_number INTEGER NOT NULL
);

CREATE TABLE task_revisions (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	task_id    TEXT NOT NULL REFERENCES tasks (id) ON UPDATE CASCADE ON DELETE CASCADE,
	field      TEXT NOT NULL,
	ref_id     TEXT,
	body       TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE task_tags (
	task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	tag TEXT NOT NULL REFERENCES tags (name) ON UPDATE CASCADE,
	PRIMARY KEY (task_id, tag)
) WITHOUT ROWID;

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
	created_at  TEXT NOT NULL,
	updated_at  TEXT NOT NULL,
	closed_at   TEXT,
	closed_reason TEXT, scope_id INTEGER REFERENCES scopes (id) ON DELETE SET NULL, deleted_at TEXT, blocked_from_status TEXT, estimate TEXT, assignee TEXT, due_at TEXT, blocked_reason TEXT, key TEXT, auto_closed INTEGER NOT NULL DEFAULT 0,
	UNIQUE (project_id, number)
);

CREATE INDEX idx_activity_created_at ON activity (created_at);

CREATE INDEX idx_activity_entity ON activity (entity, entity_id, created_at);

CREATE INDEX idx_activity_entity_task ON activity (entity_task_id, id);

CREATE INDEX idx_projects_repo ON projects (repo COLLATE NOCASE);

CREATE INDEX idx_scopes_project ON scopes (project_id);

CREATE INDEX idx_task_attachments_deleted ON task_attachments(deleted_at);

CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);

CREATE INDEX idx_task_comments_deleted ON task_comments (deleted_at);

CREATE INDEX idx_task_comments_task ON task_comments (task_id, created_at);

CREATE INDEX idx_task_links_source ON task_links (source_task_id, link_type);

CREATE INDEX idx_task_links_target ON task_links (target_task_id, link_type);

CREATE INDEX idx_task_revisions_task ON task_revisions (task_id, created_at);

CREATE INDEX idx_task_tags_tag ON task_tags (tag);

CREATE INDEX idx_tasks_deleted ON tasks (deleted_at);

CREATE INDEX idx_tasks_epic ON tasks (epic_id);

CREATE UNIQUE INDEX idx_tasks_key ON tasks (key);

CREATE INDEX idx_tasks_project ON tasks (project_id);

CREATE INDEX idx_tasks_scope ON tasks (scope_id);

CREATE INDEX idx_tasks_status ON tasks (status);

CREATE INDEX idx_tasks_updated ON tasks (updated_at);

CREATE TRIGGER trg_projects_prefix_nocase_insert
BEFORE INSERT ON projects
WHEN EXISTS (
	SELECT 1 FROM projects WHERE lower(prefix) = lower(NEW.prefix)
)
BEGIN
	SELECT RAISE(ABORT, 'project prefix conflicts with an existing prefix (case-insensitive)');
END;

CREATE TRIGGER trg_projects_prefix_nocase_update
BEFORE UPDATE OF prefix ON projects
WHEN EXISTS (
	SELECT 1 FROM projects WHERE id <> OLD.id AND lower(prefix) = lower(NEW.prefix)
)
BEGIN
	SELECT RAISE(ABORT, 'project prefix conflicts with an existing prefix (case-insensitive)');
END;

CREATE TRIGGER trg_projects_prefix_upper_insert
BEFORE INSERT ON projects
WHEN NEW.prefix <> upper(NEW.prefix)
BEGIN
	SELECT RAISE(ABORT, 'project prefix must be uppercase');
END;

CREATE TRIGGER trg_projects_prefix_upper_update
BEFORE UPDATE OF prefix ON projects
WHEN NEW.prefix <> upper(NEW.prefix)
BEGIN
	SELECT RAISE(ABORT, 'project prefix must be uppercase');
END;

insert into schema_migrations (name, executed_at, batch) values ('001_init.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('002_scopes.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('003_soft_delete.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('004_task_blocked_by.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('005_activity_log.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('006_projects_prefix_case.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('007_task_comments.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('008_task_revisions.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('009_activity_changes.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('010_task_source_unique.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('011_drop_task_source_line.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('012_blocked_from_status.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('013_task_estimate.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('014_task_assignee_due_at.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('015_task_attachments.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('016_task_links.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('017_task_blocked_reason.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('018_project_repo.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('019_activity_client.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('020_tags.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('021_task_tags.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('022_attachment_soft_delete.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('023_task_identity.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('024_task_activity_identity.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('025_drop_activity_old_id.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);

insert into schema_migrations (name, executed_at, batch) values ('026_task_auto_closed.js', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1);
