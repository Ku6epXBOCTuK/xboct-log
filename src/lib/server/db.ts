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
	return db;
}

let singleton: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
	singleton ??= openDatabase(defaultDbPath());
	return singleton;
}

export function closeDb(): void {
	singleton?.close();
	singleton = undefined;
}
