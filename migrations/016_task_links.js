export const up = (db) => {
	db.exec(`
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

CREATE INDEX idx_task_links_source ON task_links (source_task_id, link_type);
CREATE INDEX idx_task_links_target ON task_links (target_task_id, link_type);

INSERT INTO task_links (source_task_id, target_task_id, link_type, created_at)
	SELECT blocked_by_task_id, blocked_task_id, 'blocks', created_at
	FROM task_blocked_by;

DROP TABLE task_blocked_by;
`);
};

export const down = (db) => {
	db.exec(`
CREATE TABLE task_blocked_by (
	blocked_task_id TEXT NOT NULL REFERENCES tasks (id),
	blocked_by_task_id TEXT NOT NULL REFERENCES tasks (id),
	created_at TEXT NOT NULL,
	PRIMARY KEY (blocked_task_id, blocked_by_task_id),
	CHECK (blocked_task_id <> blocked_by_task_id)
);

CREATE INDEX idx_task_blocked_by_blocker ON task_blocked_by (blocked_by_task_id);

INSERT INTO task_blocked_by (blocked_task_id, blocked_by_task_id, created_at)
	SELECT target_task_id, source_task_id, created_at
	FROM task_links WHERE link_type = 'blocks';

DROP TABLE task_links;
`);
};
