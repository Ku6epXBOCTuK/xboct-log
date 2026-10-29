import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupConfig, listBackups, runBackup } from "../server/backup";
import { getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { ensureInbox } from "../server/projects";
import { runOp } from "./define";
import { getOps, mcpOps } from "./index";

const savedEnv = { ...process.env };
let dir = "";

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "xboct-backups-op-"));
	process.env.XBOCT_LOG_BACKUP_DIR = join(dir, "backups");
});

afterEach(() => {
	process.env = { ...savedEnv };
	rmSync(dir, { recursive: true, force: true });
});

function op(name: string) {
	const found = getOps().get(name);
	if (found === undefined) {
		throw new Error(`unknown op: ${name}`);
	}
	return found;
}

async function manualBackup(): Promise<string> {
	const db = getDb();
	await migrateDatabase(db);
	ensureInbox(db);
	const written = await runBackup(db, backupConfig(), "manual");
	expect(written.isOk()).toBe(true);
	const [entry] = listBackups(backupConfig());
	if (entry === undefined) throw new Error("no backup was written");
	return entry.name;
}

describe("backup restore ops", () => {
	it("keeps restoring out of the MCP tool list", () => {
		const names = mcpOps().map((entry) => entry.name);

		expect(names).not.toContain("backups_restore");
		expect(names).not.toContain("backups_inspect");
		expect(names).toContain("backup_create");
		expect(op("backups_restore").mcp).toBe(false);
	});

	it("reports the contents of a snapshot", async () => {
		const name = await manualBackup();

		const info = await runOp(op("backups_inspect"), { kind: "manual", name });

		expect(info).toEqual({ projects: 1, tasks: 0 });
	});

	it("refuses a file that is not in the backup folders", async () => {
		await expect(
			runOp(op("backups_inspect"), { kind: "manual", name: "../live.db" }),
		).rejects.toMatchObject({ status: 404 });
	});
});
