import {
	copyFileSync,
	existsSync,
	mkdirSync,
	openSync,
	closeSync,
	readSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import {
	type BackupConfig,
	type BackupFile,
	type BackupKind,
	listBackups,
} from "./backup";
import { closeDb, getDb, openDatabase } from "./db";
import {
	type AppError,
	conflict,
	invalid,
	notFound,
	unexpected,
} from "./errors";
import { knownMigrations, migrateDatabase } from "./migrations";
import { ensureInbox } from "./projects";

const SQLITE_HEADER = "SQLite format 3";
const HEADER_LENGTH = SQLITE_HEADER.length;

export interface SnapshotInfo {
	projects: number;
	tasks: number;
}

export interface RestoreOutcome {
	snapshot: SnapshotInfo;
	safetyPath: string;
}

export function findBackup(
	config: BackupConfig,
	kind: BackupKind,
	name: string,
): BackupFile | undefined {
	return listBackups(config).find(
		(entry) => entry.kind === kind && entry.name === name,
	);
}

function headerLooksLikeDatabase(path: string): boolean {
	const fd = openSync(path, "r");
	try {
		const buffer = Buffer.alloc(HEADER_LENGTH);
		const read = readSync(fd, buffer, 0, HEADER_LENGTH, 0);
		return read === HEADER_LENGTH && buffer.toString("utf8") === SQLITE_HEADER;
	} finally {
		closeSync(fd);
	}
}

function appliedMigrations(db: DatabaseSync): string[] {
	const rows = db.prepare("SELECT name FROM schema_migrations").all();
	return rows.map((row) => String(row.name));
}

export function inspectSnapshot(path: string): Result<SnapshotInfo, AppError> {
	if (!existsSync(path)) {
		return err(notFound(`backup not found: ${path}`));
	}
	if (!headerLooksLikeDatabase(path)) {
		return err(invalid(`not a SQLite database: ${path}`));
	}

	let db: DatabaseSync;
	try {
		db = new DatabaseSync(path, { readOnly: true });
	} catch (error) {
		return err(unexpected(error));
	}
	try {
		const integrity = db.prepare("PRAGMA integrity_check").get();
		const verdict = integrity?.integrity_check;
		if (verdict !== "ok") {
			return err(invalid(`integrity check failed: ${String(verdict)}`));
		}
		const table = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
			)
			.get();
		if (table === undefined) {
			return err(invalid("no schema_migrations table, this is not a backup"));
		}
		// NOTE: a snapshot migrated by a newer build cannot be opened by an
		// older one, so the unknown names are refused instead of guessed at.
		let known: string[];
		try {
			known = knownMigrations();
		} catch (error) {
			return err(unexpected(error));
		}
		const unknown = appliedMigrations(db).filter(
			(name) => !known.includes(name),
		);
		if (unknown.length > 0) {
			return err(
				invalid(
					`the snapshot comes from a newer version, deploy it first: ${unknown.join(", ")}`,
				),
			);
		}
		const projects = db.prepare("SELECT COUNT(*) AS n FROM projects").get();
		const tasks = db.prepare("SELECT COUNT(*) AS n FROM tasks").get();
		return ok({
			projects: Number(projects?.n ?? 0),
			tasks: Number(tasks?.n ?? 0),
		});
	} catch (error) {
		return err(unexpected(error));
	} finally {
		db.close();
		dropEmptySidecars(path);
	}
}

let restoring = false;

export interface RestoreRequest {
	dbPath: string;
	config: BackupConfig;
	target: BackupFile;
	now?: Date;
}

function dropSidecars(path: string): void {
	for (const suffix of ["-wal", "-shm"]) {
		rmSync(`${path}${suffix}`, { force: true });
	}
}

// NOTE: a read-only open of a WAL database leaves an empty -wal/-shm pair next
// to it, and the backup folder should hold nothing but the snapshots.
function dropEmptySidecars(path: string): void {
	const wal = `${path}-wal`;
	try {
		if (statSync(wal).size > 0) return;
	} catch {
		for (const suffix of ["-wal", "-shm"]) {
			rmSync(`${path}${suffix}`, { force: true });
		}
		return;
	}
	dropSidecars(path);
}

async function stageSnapshot(
	target: BackupFile,
	staged: string,
): Promise<Result<void, AppError>> {
	dropSidecars(staged);
	rmSync(staged, { force: true });
	try {
		copyFileSync(target.path, staged);
	} catch (error) {
		return err(unexpected(error));
	}

	let db: DatabaseSync;
	try {
		db = openDatabase(staged);
	} catch (error) {
		return err(unexpected(error));
	}
	try {
		await migrateDatabase(db);
		db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
	} catch (error) {
		return err(unexpected(error));
	} finally {
		db.close();
		dropSidecars(staged);
	}
	return ok(undefined);
}

export async function restoreBackup({
	dbPath,
	config,
	target,
	now = new Date(),
}: RestoreRequest): Promise<Result<RestoreOutcome, AppError>> {
	if (restoring) {
		return err(conflict("another restore is already running"));
	}
	restoring = true;
	try {
		if (config.dir === "") {
			return err(invalid("the backup directory is not configured"));
		}
		const inspected = inspectSnapshot(target.path);
		if (inspected.isErr()) {
			return err(inspected.error);
		}

		const staged = `${dbPath}.new`;
		const stagedResult = await stageSnapshot(target, staged);
		if (stagedResult.isErr()) {
			rmSync(staged, { force: true });
			return err(stagedResult.error);
		}

		const stamp = now.toISOString().replace(/[:.]/g, "-");
		const safetyPath = join(
			config.dir,
			"manual",
			`xboct-log-before-restore-${stamp}.db`,
		);
		try {
			mkdirSync(dirname(safetyPath), { recursive: true });
			await backup(getDb(dbPath), safetyPath);
		} catch (error) {
			rmSync(staged, { force: true });
			return err(unexpected(error));
		}

		// NOTE: from closeDb() to getDb() there is no await, so no other request
		// can observe the database between the copy and the reopen.
		try {
			closeDb();
			dropSidecars(dbPath);
			renameSync(staged, dbPath);
		} catch (error) {
			dropSidecars(staged);
			rmSync(staged, { force: true });
			getDb(dbPath);
			return err(unexpected(error));
		}

		try {
			const db = getDb(dbPath);
			ensureInbox(db);
			db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
		} catch (error) {
			return err(unexpected(error));
		}

		return ok({ snapshot: inspected.value, safetyPath });
	} finally {
		restoring = false;
	}
}
