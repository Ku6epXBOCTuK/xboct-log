export const up = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE tasks DROP COLUMN blocked_reason;
`);
};
