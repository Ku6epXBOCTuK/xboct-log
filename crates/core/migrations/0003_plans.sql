CREATE TABLE IF NOT EXISTS plans (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'active', 'done', 'cancelled')),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    closed_at   TEXT,
    deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_plans_name ON plans (name);
CREATE INDEX IF NOT EXISTS idx_plans_deleted ON plans (deleted_at);

CREATE TABLE IF NOT EXISTS plan_items (
    plan_id  TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    task_id  TEXT NOT NULL REFERENCES tasks (id),
    position INTEGER NOT NULL,
    UNIQUE (plan_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_items_plan_position ON plan_items (plan_id, position);
CREATE INDEX IF NOT EXISTS idx_plan_items_task ON plan_items (task_id);

CREATE TABLE IF NOT EXISTS plan_notes (
    id         TEXT PRIMARY KEY,
    plan_id    TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    task_id    TEXT NOT NULL REFERENCES tasks (id),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edited_at  TEXT,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_notes_plan_task_created ON plan_notes (plan_id, task_id, created_at);

CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects (id),
    number      INTEGER NOT NULL,
    key         TEXT,
    kind        TEXT NOT NULL CHECK (kind IN ('adr', 'prd', 'architecture', 'research', 'workflow', 'guide', 'spec')),
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'accepted', 'superseded', 'archived')),
    source_file TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    closed_at   TEXT,
    deleted_at  TEXT,
    UNIQUE (project_id, number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_key ON documents (key);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents (project_id);
CREATE INDEX IF NOT EXISTS idx_documents_kind ON documents (kind);
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents (deleted_at);

CREATE TABLE IF NOT EXISTS document_number_high_water (
    project_id  TEXT PRIMARY KEY REFERENCES projects (id),
    last_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_documents (
    plan_id     TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents (id),
    PRIMARY KEY (plan_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_documents_document ON plan_documents (document_id);

CREATE TABLE IF NOT EXISTS text_revisions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    entity     TEXT NOT NULL CHECK (entity IN ('plan', 'plan_note', 'document')),
    entity_id  TEXT NOT NULL,
    field      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_text_revisions_entity ON text_revisions (entity, entity_id, created_at);
