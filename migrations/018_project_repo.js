export const up = (db) => {
	db.exec(`
ALTER TABLE projects ADD COLUMN repo TEXT;

CREATE INDEX idx_projects_repo ON projects (repo COLLATE NOCASE);
`);
};

export const down = (db) => {
	db.exec(`
DROP INDEX idx_projects_repo;

ALTER TABLE projects DROP COLUMN repo;
`);
};
