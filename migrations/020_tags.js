export const up = (db) => {
	// NOTE: [a-z0-9][a-z0-9_-]* rejects one-character names in this SQLite build, so the check negates instead
	db.exec(`
CREATE TABLE IF NOT EXISTS tags (
	name TEXT PRIMARY KEY CHECK (
		name <> ''
		AND length(name) <= 20
		AND name GLOB '[a-z0-9]*'
		AND name NOT GLOB '*[^a-z0-9_-]*'
	),
	archived INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO tags (name, archived, created_at)
SELECT DISTINCT je.value, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tasks, json_each(tasks.tags) AS je
WHERE je.value <> '';
`);
};

export const down = (db) => {
	db.exec(`
DROP TABLE IF EXISTS tags;
`);
};
