import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { type AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

interface Batch {
	items: Record<string, unknown>[];
	succeeded: number;
	failed: number;
}

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-batch-shape-"));
	const db = getDb(join(dbDir, "batch.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
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

async function call(name: string, input: unknown): Promise<Batch> {
	return (await runOp(op(name), input, "mcp")) as Batch;
}

describe("batch response shape", () => {
	it("uses one envelope and one element shape for every batch tool", async () => {
		const db = getDb();
		const first = unwrap(createTask(db, { project_id: "spa", title: "First" }));
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Second" }),
		);

		const created = await call("tasks_create_many", {
			items: [{ project_id: "spa", title: "Created" }],
		});
		const updated = await call("tasks_update_many", {
			items: [{ task_id: first.id, patch: { priority: "high" } }],
		});
		const closed = await call("tasks_close_many", {
			items: [{ task_id: second.id, reason: "fixed" }],
		});

		for (const result of [created, updated, closed]) {
			expect(Object.keys(result).sort()).toEqual([
				"failed",
				"items",
				"succeeded",
			]);
		}

		const keys = Object.keys(created.items[0]).sort();
		expect(keys).toEqual([
			"changes",
			"id",
			"index",
			"ok",
			"released",
			"task",
			"warnings",
		]);
		expect(Object.keys(updated.items[0]).sort()).toEqual(keys);
		expect(Object.keys(closed.items[0]).sort()).toEqual(keys);

		expect(created.items[0].id).toBe(
			(created.items[0].task as { id: string }).id,
		);
		expect(updated.items[0].id).toBe(first.id);
		expect(closed.items[0].id).toBe(second.id);
	});

	it("reports a failed item with the same keys", async () => {
		const created = await call("tasks_create_many", {
			items: [{ project_id: "ghost", title: "Nope" }],
		});
		const updated = await call("tasks_update_many", {
			items: [{ task_id: "SPA-9999", patch: { priority: "low" } }],
		});

		expect(Object.keys(created.items[0]).sort()).toEqual([
			"error",
			"id",
			"index",
			"ok",
		]);
		expect(Object.keys(updated.items[0]).sort()).toEqual([
			"error",
			"id",
			"index",
			"ok",
		]);
		expect(created.items[0].id).toBeNull();
		expect(updated.items[0].id).toBe("SPA-9999");
	});
});
