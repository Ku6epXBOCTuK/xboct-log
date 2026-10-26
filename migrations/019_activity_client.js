export const up = (db) => {
	db.exec(`
ALTER TABLE activity ADD COLUMN client TEXT;
`);
};

export const down = (db) => {
	db.exec(`
ALTER TABLE activity DROP COLUMN client;
`);
};
