export const up = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN blocked_from_status TEXT;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE tasks DROP COLUMN blocked_from_status;
`);
};
