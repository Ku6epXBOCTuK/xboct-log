import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type BackupConfig,
	backupConfig,
	backupFileName,
	catchUp,
	isoWeek,
	localDate,
	prune,
	runBackup,
	runScheduled,
} from "./backup";
import { openMigratedDatabase } from "./migrations";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "xboct-backup-"));
}

function testConfig(dir: string): BackupConfig {
	return {
		dir,
		hour: 3,
		minute: 0,
		weekday: 0,
		dailyKeep: 2,
		weeklyKeep: 2,
		disabled: false,
	};
}

const savedEnv = { ...process.env };

afterEach(() => {
	process.env = { ...savedEnv };
});

describe("backup names", () => {
	it("formats daily dates and iso weeks", () => {
		expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
		expect(isoWeek(new Date(2026, 0, 1))).toBe("2026-W01");
		expect(isoWeek(new Date(2026, 0, 5))).toBe("2026-W02");
		expect(backupFileName("daily", new Date(2026, 0, 5))).toBe(
			"xboct-log-2026-01-05.db",
		);
		expect(backupFileName("weekly", new Date(2026, 0, 5))).toBe(
			"xboct-log-2026-W02.db",
		);
	});
});

describe("runBackup", () => {
	it("writes a dated copy into the daily folder", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const result = await runBackup(
			db,
			testConfig(dir),
			"daily",
			new Date(2026, 0, 5),
		);

		expect(result.isOk()).toBe(true);
		expect(readdirSync(join(dir, "daily"))).toEqual([
			"xboct-log-2026-01-05.db",
		]);
	});

	it("does nothing when disabled", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const config = { ...testConfig(dir), disabled: true };
		const result = await runBackup(db, config, "daily", new Date(2026, 0, 5));

		expect(result.isOk()).toBe(true);
		expect(result._unsafeUnwrap()).toBe("");
	});
});

describe("prune", () => {
	it("keeps the newest files and drops the rest", () => {
		const dir = tempDir();
		for (const name of [
			"xboct-log-2026-01-01.db",
			"xboct-log-2026-01-02.db",
			"xboct-log-2026-01-03.db",
		]) {
			writeFileSync(join(dir, name), "");
		}

		prune(dir, 2);

		expect(readdirSync(dir).sort()).toEqual([
			"xboct-log-2026-01-02.db",
			"xboct-log-2026-01-03.db",
		]);
	});

	it("rotates daily files down to the keep limit", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const config = testConfig(dir);
		await runBackup(db, config, "daily", new Date(2026, 0, 1));
		await runBackup(db, config, "daily", new Date(2026, 0, 2));
		await runBackup(db, config, "daily", new Date(2026, 0, 3));

		expect(readdirSync(join(dir, "daily")).sort()).toEqual([
			"xboct-log-2026-01-02.db",
			"xboct-log-2026-01-03.db",
		]);
	});
});

describe("runScheduled", () => {
	it("adds a weekly copy on the configured weekday", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const sunday = new Date(2026, 0, 4);
		const result = await runScheduled(db, testConfig(dir), sunday);

		expect(result.isOk()).toBe(true);
		expect(readdirSync(join(dir, "weekly"))).toEqual(["xboct-log-2026-W01.db"]);
	});

	it("skips the weekly copy on other days", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const result = await runScheduled(
			db,
			testConfig(dir),
			new Date(2026, 0, 5),
		);

		expect(result.isOk()).toBe(true);
		expect(readdirSync(dir)).toEqual(["daily"]);
	});
});

describe("catchUp", () => {
	it("skips before the scheduled time", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const config = { ...testConfig(dir), hour: 23 };
		const result = await catchUp(db, config, new Date(2026, 0, 5, 10, 0));

		expect(result.isOk()).toBe(true);
		expect(result._unsafeUnwrap()).toEqual([]);
	});

	it("runs once when the daily copy is missing", async () => {
		const dir = tempDir();
		const db = await openMigratedDatabase(":memory:");
		const config = testConfig(dir);
		const first = await catchUp(db, config, new Date(2026, 0, 5, 10, 0));
		const second = await catchUp(db, config, new Date(2026, 0, 5, 11, 0));

		expect(first._unsafeUnwrap()).toHaveLength(1);
		expect(second._unsafeUnwrap()).toEqual([]);
	});
});

describe("backupConfig", () => {
	it("reads env overrides", () => {
		process.env.XBOCT_LOG_BACKUP_DIR = "C:/tmp/backups";
		process.env.XBOCT_LOG_BACKUP_HOUR = "5";
		process.env.XBOCT_LOG_BACKUP_WEEKLY_KEEP = "9";
		process.env.XBOCT_LOG_BACKUP_DISABLED = "1";

		expect(backupConfig()).toMatchObject({
			dir: "C:/tmp/backups",
			hour: 5,
			weeklyKeep: 9,
			disabled: true,
		});
	});

	it("falls back to defaults", () => {
		delete process.env.XBOCT_LOG_BACKUP_DIR;
		delete process.env.XBOCT_LOG_BACKUP_HOUR;
		delete process.env.XBOCT_LOG_BACKUP_DISABLED;

		const config = backupConfig();
		expect(config.hour).toBe(3);
		expect(config.dailyKeep).toBe(7);
		expect(config.disabled).toBe(false);
	});
});
