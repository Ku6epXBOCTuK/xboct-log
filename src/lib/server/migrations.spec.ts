import type { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

let db: DatabaseSync;

// NOTE: the cases run on one database in migration order, so each one applies
// only its own migration instead of replaying the whole prefix three times.
beforeAll(() => {
	db = createDb();
});

afterAll(() => {
	db.close();
	cleanupMigrationDirs();
});

describe("migration up/down/up", () => {
	it.each(NAMES)("%s", async (name) => {
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
	});
});
