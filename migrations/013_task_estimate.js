// NOTE: the estimate is backfilled from the est:S / est:M / est:L tags the
// tasks used to carry; est:M/L stays empty because it names two sizes.
export const up = (db) => {
	db.exec(`
ALTER TABLE tasks ADD COLUMN estimate TEXT;
`);
	for (const size of ["S", "M", "L"]) {
		db.exec(`
UPDATE tasks
   SET estimate = '${size}'
 WHERE estimate IS NULL
   AND EXISTS (
     SELECT 1 FROM json_each(tasks.tags) WHERE json_each.value = 'est:${size}'
   );
`);
	}
};

export const down = (db) => {
	db.exec(`
ALTER TABLE tasks DROP COLUMN estimate;
`);
};
