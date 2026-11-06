export const up = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN auto_closed INTEGER NOT NULL DEFAULT 0;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE tasks DROP COLUMN auto_closed;
`);
};
