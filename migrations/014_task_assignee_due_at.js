export const up = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN assignee TEXT;
`);
	db.exec(`
ALTER TABLE tasks ADD COLUMN due_at TEXT;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE tasks DROP COLUMN due_at;
`);
	db.exec(`
ALTER TABLE tasks DROP COLUMN assignee;
`);
};
