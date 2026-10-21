import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask, updateTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-revisions-"));
	const db = getDb(join(dbDir, "revisions.db"));
	await migrateDatabase(db);
	const project = createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	expect(project.isOk()).toBe(true);
	const task = createTask(db, {
		project_id: "spa",
		title: "Alpha",
		description: "first",
	});
	expect(task.isOk()).toBe(true);
});

afterAll(() => {
	closeDb();
	rmSync(dbDir, { recursive: true, force: true });
});

function op(name: string) {
	const found = getOps().get(name);
	if (!found) {
		throw new Error(`unknown op: ${name}`);
	}
	return found;
}

async function list(input: unknown): Promise<{
	items: { field: string; body: string; created_at: string }[];
	total: number;
}> {
	return (await runOp(op("tasks_revisions_list"), input, "mcp")) as never;
}

describe("tasks_revisions_list", () => {
	it("returns the previous texts of a task", async () => {
		const db = getDb();
		const updated = updateTask(db, "SPA-1", { description: "second" });
		expect(updated.isOk()).toBe(true);

		const result = await list({ id: "SPA-1" });

		expect(result.total).toBe(1);
		expect(result.items[0].field).toBe("description");
		expect(result.items[0].body).toBe("first");
		expect(result.items[0].created_at).toBeTypeOf("string");
	});

	it("keeps only the requested field", async () => {
		const result = await list({ id: "SPA-1", field: "comment" });

		expect(result.total).toBe(0);
		expect(result.items).toEqual([]);
	});

	it("fails for an unknown task id", async () => {
		await expect(list({ id: "SPA-99" })).rejects.toThrow();
	});
});
