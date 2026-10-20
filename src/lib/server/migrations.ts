import type { DatabaseSync } from "node:sqlite";
import { Migrator } from "@ku6epxboctuk/sqlite-up";
import { XBOCT_LOG_MIGRATIONS } from "$app/env/private";
import { openDatabase } from "./db";

function createMigrator(db: DatabaseSync): Migrator {
	return new Migrator({
		db,
		migrationsDir: XBOCT_LOG_MIGRATIONS,
		fileExtensions: ["js"],
	});
}

export async function migrateDatabase(db: DatabaseSync): Promise<string[]> {
	const result = await createMigrator(db).apply();
	if (!result.success) {
		throw result.error ?? new Error("migration failed");
	}

	return result.appliedMigrations;
}

export async function openMigratedDatabase(
	location: string,
): Promise<DatabaseSync> {
	const db = openDatabase(location);
	await migrateDatabase(db);
	return db;
}
