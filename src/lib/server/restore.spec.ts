import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
	type BackupConfig,
	type BackupFile,
	listBackups,
	runBackup,
} from "./backup";
import { closeDb, getDb } from "./db";
import { migrateDatabase } from "./migrations";
import { ensureInbox } from "./projects";
import { findBackup, inspectSnapshot, restoreBackup } from "./restore";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "xboct-restore-"));
}

function testConfig(dir: string): BackupConfig {
	return {
		dir,
		hour: 3,
		minute: 0,
		weekday: 0,
		dailyKeep: 2,
		weeklyKeep: 2,
		autoKeep: 2,
		autoIntervalMin: 30,
		disabled: false,
	};
}

async function liveDatabase(path: string): Promise<DatabaseSync> {
	const db = getDb(path);
	await migrateDatabase(db);
	ensureInbox(db);
	return db;
}

function insertTask(db: DatabaseSync, id: string, number: number): void {
	const now = new Date().toISOString();
	db.prepare(
		"INSERT INTO tasks (id, project_id, number, title, status, priority, created_at, updated_at) VALUES (?, 'inbox', ?, ?, 'backlog', 'medium', ?, ?)",
	).run(id, number, id, now, now);
}

function onlyBackup(config: BackupConfig): BackupFile {
	const [entry] = listBackups(config);
	if (entry === undefined) throw new Error("no backup was written");
	return entry;
}

afterEach(() => {
	closeDb();
});

describe("inspectSnapshot", () => {
	it("reports the task and project counts of a snapshot", async () => {
		const dir = tempDir();
		const db = await liveDatabase(join(dir, "live.db"));
		insertTask(db, "INB-1", 1);
		const config = testConfig(join(dir, "backups"));
		await runBackup(db, config, "manual", new Date(2026, 0, 5, 14, 30));
		const entry = onlyBackup(config);

		const info = inspectSnapshot(entry.path);

		expect(info._unsafeUnwrap()).toEqual({ projects: 1, tasks: 1 });
		expect(existsSync(`${entry.path}-wal`)).toBe(false);
		expect(existsSync(`${entry.path}-shm`)).toBe(false);
	});

	it("rejects a file that is not a database", () => {
		const dir = tempDir();
		const path = join(dir, "notes.db");
		writeFileSync(path, "just text");

		const info = inspectSnapshot(path);

		expect(info.isErr()).toBe(true);
		expect(info._unsafeUnwrapErr().kind).toBe("validation");
	});

	it("rejects a snapshot that comes from a newer version", async () => {
		const dir = tempDir();
		const db = await liveDatabase(join(dir, "live.db"));
		const config = testConfig(join(dir, "backups"));
		await runBackup(db, config, "manual", new Date(2026, 0, 5, 14, 30));
		const entry = onlyBackup(config);
		const future = join(dir, "future.db");
		copyFileSync(entry.path, future);
		const copy = new DatabaseSync(future);
		copy
			.prepare(
				"INSERT INTO schema_migrations (name, executed_at, batch) VALUES ('999_future.js', ?, 99)",
			)
			.run(new Date().toISOString());
		copy.close();

		const info = inspectSnapshot(future);

		expect(info.isErr()).toBe(true);
		expect(info._unsafeUnwrapErr().message).toContain("newer version");
	});
});

describe("restoreBackup", () => {
	it("replaces the live database with the snapshot and saves the old one", async () => {
		const dir = tempDir();
		const dbPath = join(dir, "live.db");
		const db = await liveDatabase(dbPath);
		insertTask(db, "INB-1", 1);
		const config = testConfig(join(dir, "backups"));
		await runBackup(db, config, "manual", new Date(2026, 0, 5, 14, 30));
		const entry = onlyBackup(config);
		insertTask(db, "INB-2", 2);
		db.prepare("DELETE FROM tasks WHERE id = 'INB-1'").run();

		const outcome = await restoreBackup({ dbPath, config, target: entry });

		expect(outcome.isOk()).toBe(true);
		const restored = getDb(dbPath);
		const rows = restored.prepare("SELECT id FROM tasks ORDER BY id").all();
		expect(rows.map((row) => String(row.id))).toEqual(["INB-1"]);
		const saved = outcome._unsafeUnwrap().safetyPath;
		expect(existsSync(saved)).toBe(true);
		expect(existsSync(entry.path)).toBe(true);
		expect(existsSync(`${dbPath}.new`)).toBe(false);
	});

	it("keeps the live database when the snapshot is unreadable", async () => {
		const dir = tempDir();
		const dbPath = join(dir, "live.db");
		const db = await liveDatabase(dbPath);
		insertTask(db, "INB-1", 1);
		const config = testConfig(join(dir, "backups"));
		await runBackup(db, config, "manual", new Date(2026, 0, 5, 14, 30));
		const entry = onlyBackup(config);
		const broken = join(dir, "broken.db");
		writeFileSync(broken, "not a database");

		const outcome = await restoreBackup({
			dbPath,
			config,
			target: { ...entry, path: broken },
		});

		expect(outcome.isErr()).toBe(true);
		const rows = getDb(dbPath).prepare("SELECT id FROM tasks").all();
		expect(rows.map((row) => String(row.id))).toEqual(["INB-1"]);
		expect(existsSync(`${dbPath}.new`)).toBe(false);
	});

	it("finds a backup by kind and name and nothing else", async () => {
		const dir = tempDir();
		const db = await liveDatabase(join(dir, "live.db"));
		const config = testConfig(join(dir, "backups"));
		await runBackup(db, config, "manual", new Date(2026, 0, 5, 14, 30));
		const entry = onlyBackup(config);

		expect(findBackup(config, "manual", entry.name)?.path).toBe(entry.path);
		expect(findBackup(config, "manual", "../live.db")).toBeUndefined();
		expect(findBackup(config, "auto", entry.name)).toBeUndefined();
	});
});
