export const up = (db) => {
	const duplicates = db
		.prepare(
			`SELECT project_id, source_file, source_line, COUNT(*) AS count
			 FROM tasks
			 WHERE source_file IS NOT NULL AND source_line IS NOT NULL
			 GROUP BY project_id, source_file, source_line
			 HAVING count > 1`,
		)
		.all();

	if (duplicates.length > 0) {
		throw new Error(
			`cannot enforce unique source location: ${duplicates.length} duplicate group(s) found`,
		);
	}

	db.exec(`
CREATE UNIQUE INDEX idx_tasks_source_location
	ON tasks (project_id, source_file, source_line)
	WHERE source_file IS NOT NULL AND source_line IS NOT NULL;
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX IF EXISTS idx_tasks_source_location;
`);
};
