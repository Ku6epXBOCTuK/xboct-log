import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultDbPath } from "./paths";

export function openDatabase(location: string): DatabaseSync {
	if (location !== ":memory:") {
		mkdirSync(dirname(location), { recursive: true });
	}

	const db = new DatabaseSync(location);
	db.exec("PRAGMA journal_mode = WAL;");
	db.exec("PRAGMA foreign_keys = ON;");
	db.function("ULOWER", { deterministic: true }, (value) =>
		value == null ? null : String(value).toLowerCase(),
	);
	return db;
}

// NOTE: the connection lives on globalThis, so a vite module reload adopts
// the live handle instead of opening a second connection to the same file.
const GLOBAL_KEY = Symbol.for("xboct-log.database");

interface GlobalDatabase {
	db: DatabaseSync;
	path: string;
}

const globals = globalThis as unknown as Record<
	symbol,
	GlobalDatabase | undefined
>;

let local: DatabaseSync | undefined;

export function getDb(location?: string): DatabaseSync {
	if (local) return local;
	const path = location ?? defaultDbPath();
	const stored = globals[GLOBAL_KEY];
	if (stored && stored.path === path) {
		local = stored.db;
		return local;
	}
	const db = openDatabase(path);
	local = db;
	globals[GLOBAL_KEY] = { db, path };
	return db;
}

export function closeDb(): void {
	if (!local) return;
	local.close();
	if (globals[GLOBAL_KEY]?.db === local) {
		globals[GLOBAL_KEY] = undefined;
	}
	local = undefined;
}

export function withTransaction<T>(db: DatabaseSync, run: () => T): T {
	db.exec("BEGIN IMMEDIATE");
	try {
		const value = run();
		db.exec("COMMIT");
		return value;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}
