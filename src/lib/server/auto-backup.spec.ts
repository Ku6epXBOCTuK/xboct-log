import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	maybeAutoBackup,
	newestAutoSnapshotAt,
	resetAutoBackupState,
} from "./auto-backup";
import { type BackupConfig } from "./backup";
import { openMigratedDatabase } from "./migrations";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "xboct-auto-backup-"));
}

function testConfig(dir: string): BackupConfig {
	return {
		dir,
		hour: 3,
		minute: 0,
		weekday: 0,
		dailyKeep: 2,
		weeklyKeep: 2,
		autoKeep: 48,
		autoIntervalMin: 30,
		disabled: false,
	};
}

const MINUTE = 60_000;

beforeEach(() => {
	resetAutoBackupState();
});

describe("maybeAutoBackup", () => {
	it("writes a snapshot on the first call", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");

		const path = await maybeAutoBackup(db, testConfig(dir), new Date());

		expect(path.startsWith(join(dir, "auto"))).toBe(true);
		expect(readdirSync(join(dir, "auto"))).toHaveLength(1);
	});

	it("skips a second call inside the interval", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const now = new Date();

		await maybeAutoBackup(db, testConfig(dir), now);
		const second = await maybeAutoBackup(
			db,
			testConfig(dir),
			new Date(now.getTime() + MINUTE),
		);

		expect(second).toBe("");
		expect(readdirSync(join(dir, "auto"))).toHaveLength(1);
	});

	it("writes again once the interval has passed", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const now = new Date();

		await maybeAutoBackup(db, testConfig(dir), now);
		const later = await maybeAutoBackup(
			db,
			testConfig(dir),
			new Date(now.getTime() + 31 * MINUTE),
		);

		expect(later).not.toBe("");
		expect(readdirSync(join(dir, "auto"))).toHaveLength(2);
	});

	it("skips when a snapshot of an earlier run is fresh enough", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const autoDir = join(dir, "auto");
		mkdirSync(autoDir, { recursive: true });
		writeFileSync(join(autoDir, "xboct-log-2026-01-01-100000.db"), "");

		const path = await maybeAutoBackup(db, testConfig(dir), new Date());

		expect(path).toBe("");
		expect(readdirSync(autoDir)).toHaveLength(1);
	});

	it("does nothing when backups are disabled", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const config = { ...testConfig(dir), disabled: true };

		const path = await maybeAutoBackup(db, config, new Date());

		expect(path).toBe("");
	});
});

describe("newestAutoSnapshotAt", () => {
	it("returns zero when the folder is missing", () => {
		expect(newestAutoSnapshotAt(join(tempDir(), "nope"))).toBe(0);
	});
});
