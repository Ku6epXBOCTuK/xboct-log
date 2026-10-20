export const up = (db) => {
	db.exec(`
CREATE TABLE activity (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT NOT NULL,
	source     TEXT NOT NULL,
	op         TEXT NOT NULL,
	entity     TEXT NOT NULL,
	entity_id  TEXT NOT NULL,
	old_id     TEXT,
	fields     TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_activity_entity ON activity (entity, entity_id, created_at);
CREATE INDEX idx_activity_created_at ON activity (created_at);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_activity_ts;
DROP INDEX IF EXISTS idx_activity_entity;
DROP TABLE IF EXISTS activity;
`);
};
