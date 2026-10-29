import { afterAll, describe, expect, it } from "vitest";
import {
	applyMigrations,
	cleanupMigrationDirs,
	createDb,
	describeSchema,
	migrationNames,
	pendingMigrations,
	rollbackLast,
} from "./migrations-test-kit";

const NAMES = migrationNames();

// NOTE: every case replays the prefix on its own database, so the file does
// not depend on the order the runner picks.
afterAll(() => {
	cleanupMigrationDirs();
});

describe("migration up/down/up", () => {
	it.each(NAMES)("%s", async (name) => {
		const db = createDb();
		try {
			const upToNames = NAMES.slice(0, NAMES.indexOf(name) + 1);
			const before = describeSchema(db);

			await applyMigrations(db, upToNames);
			const afterUp = describeSchema(db);
			expect(afterUp).not.toEqual(before);

			await rollbackLast(db, upToNames);
			expect(describeSchema(db)).toEqual(before);

			await applyMigrations(db, upToNames);
			expect(describeSchema(db)).toEqual(afterUp);
			expect(await pendingMigrations(db, upToNames)).toBe(0);
		} finally {
			db.close();
		}
	});
});
