const TAG_NAME_MAX_LENGTH = 20;

// NOTE: legacy task tags were never validated, so names outside a-z0-9_- are
// renamed instead of dropped; the same rename runs in 021 to keep the links.
function renameTag(raw) {
	const name = String(raw)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^[^a-z0-9]+/, "")
		.slice(0, TAG_NAME_MAX_LENGTH)
		.replace(/[-_]+$/, "");
	return name === "" ? null : name;
}

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
`);
	db.function("TAG_NAME", { deterministic: true }, (value) =>
		value == null ? null : renameTag(value),
	);
	db.prepare(
		`
INSERT OR IGNORE INTO tags (name, archived, created_at)
SELECT name, 0, ?
FROM (
	SELECT DISTINCT TAG_NAME(je.value) AS name
	FROM tasks, json_each(tasks.tags) AS je
	WHERE je.value <> ''
)
WHERE name IS NOT NULL;
`,
	).run(new Date().toISOString());
};

export const down = (db) => {
	db.exec(`
DROP TABLE IF EXISTS tags;
`);
};
