import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "#lib/server/db.ts";
import { migrateDatabase } from "#lib/server/migrations.ts";

export const runtimeDir = join(
	process.cwd(),
	"tests",
	"parity",
	".tmp",
	"runtime",
);

export function databasePath(): string {
	return join(runtimeDir, "db.sqlite");
}

export function configureRuntime(): void {
	process.env.XBOCT_LOG_DB = databasePath();
	process.env.XBOCT_LOG_MEDIA_DIR = join(runtimeDir, "media");
	process.env.XBOCT_LOG_BACKUP_DIR = join(runtimeDir, "backups");
	process.env.XBOCT_LOG_BACKUP_DISABLED = "1";
}

export async function freshDatabase(): Promise<DatabaseSync> {
	rmSync(runtimeDir, { recursive: true, force: true });
	mkdirSync(runtimeDir, { recursive: true });
	configureRuntime();
	const db = getDb(databasePath());
	await migrateDatabase(db);
	return db;
}

export function openRuntimeDatabase(): DatabaseSync {
	configureRuntime();
	return getDb(databasePath());
}

export function fixtureDir(): string {
	const value = process.env.XBOCT_LOG_PARITY_OUT;
	if (value === undefined || value === "") {
		throw new Error("XBOCT_LOG_PARITY_OUT is not set; run pnpm parity:seed");
	}
	return value;
}
