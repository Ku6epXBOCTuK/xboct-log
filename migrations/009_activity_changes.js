export const up = (db) => {
	db.exec(`
ALTER TABLE activity ADD COLUMN changes TEXT NOT NULL DEFAULT '[]';
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE activity DROP COLUMN changes;
`);
};
