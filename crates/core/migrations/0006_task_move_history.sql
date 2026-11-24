CREATE TABLE IF NOT EXISTS task_move_history (
	old_key    TEXT PRIMARY KEY COLLATE NOCASE,
	task_id    TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_move_history_task ON task_move_history (task_id);
