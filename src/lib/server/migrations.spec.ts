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

afterAll(() => {
	cleanupMigrationDirs();
});

describe("migration up/down/up", () => {
	it.each(NAMES)("%s", async (name) => {
		const index = NAMES.indexOf(name);
		const beforeNames = NAMES.slice(0, index);
		const upToNames = NAMES.slice(0, index + 1);
		const db = createDb();

		try {
			await applyMigrations(db, beforeNames);
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
