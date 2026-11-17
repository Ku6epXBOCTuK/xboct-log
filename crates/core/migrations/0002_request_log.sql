CREATE TABLE IF NOT EXISTS request_log (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at    TEXT NOT NULL,
	client        TEXT,
	op            TEXT NOT NULL,
	params_hash   TEXT NOT NULL,
	params        TEXT NOT NULL,
	status        TEXT NOT NULL CHECK (status IN ('ok', 'error')),
	error_kind    TEXT,
	error_message TEXT,
	duration_ms   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_log_created_at ON request_log (created_at);

CREATE INDEX IF NOT EXISTS idx_request_log_op_hash ON request_log (op, params_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_request_log_status ON request_log (status, created_at);

CREATE INDEX IF NOT EXISTS idx_request_log_client ON request_log (client, created_at);
