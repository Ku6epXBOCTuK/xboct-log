export const up = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_tasks_source_location;
`);

	db.exec(`
ALTER TABLE tasks DROP COLUMN source_line;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN source_line INTEGER;
`);

	db.exec(`
CREATE UNIQUE INDEX idx_tasks_source_location
	ON tasks (project_id, source_file, source_line)
	WHERE source_file IS NOT NULL AND source_line IS NOT NULL;
`);
};
