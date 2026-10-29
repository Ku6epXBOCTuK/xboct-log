import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";
import type { Task } from "../types";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-blockers-"));
	const db = getDb(join(dbDir, "blockers.db"));
	await migrateDatabase(db);
	createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	createProject(db, { id: "bil", name: "Billing", prefix: "BIL" });
	createTask(db, { project_id: "spa", title: "Blocker" });
	createTask(db, { project_id: "spa", title: "Blocked", status: "open" });
	createTask(db, { project_id: "bil", title: "Blocker" });
	createTask(db, { project_id: "bil", title: "Blocked" });
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

async function call(name: string, input: unknown): Promise<unknown> {
	return runOp(op(name), input);
}

async function callTask(name: string, input: unknown): Promise<Task> {
	return (await call(name, input)) as Task;
}

async function callList(
	input: unknown,
): Promise<{ items: Task[]; total: number }> {
	return (await call("tasks_list", input)) as { items: Task[]; total: number };
}

describe("blocker tools", () => {
	it("links a blocker and reports both sides", async () => {
		const blocked = await callTask("tasks_add_blocker", {
			task_id: "SPA-2",
			blocked_by: "SPA-1",
		});

		expect(blocked.blocked_by).toEqual(["SPA-1"]);
		expect(blocked.blocks).toEqual([]);

		const blocker = await callTask("tasks_get", { task_id: "SPA-1" });
		expect(blocker.blocks).toEqual(["SPA-2"]);
		expect(blocker.blocked_by).toEqual([]);
	});

	it("filters tasks by blocker and by blocked task", async () => {
		const byBlocker = await callList({ blocked_by: "SPA-1" });
		expect(byBlocker.items.map((task) => task.id)).toEqual(["SPA-2"]);
		expect(byBlocker.total).toBe(1);

		const byBlocked = await callList({ blocks: "SPA-2" });
		expect(byBlocked.items.map((task) => task.id)).toEqual(["SPA-1"]);
		expect(byBlocked.total).toBe(1);
	});

	it("rejects bare numbers", async () => {
		await expect(
			callTask("tasks_add_blocker", {
				task_id: "2",
				blocked_by: "1",
			}),
		).rejects.toThrow(/PREFIX-NUMBER/);
	});

	it("removes the link and releases the blocked status", async () => {
		await call("tasks_update", {
			task_id: "SPA-2",
			patch: { status: "blocked" },
		});

		const released = await callTask("tasks_remove_blocker", {
			task_id: "SPA-2",
			blocked_by: "SPA-1",
		});

		expect(released.blocked_by).toEqual([]);
		expect(released.status).toBe("open");
	});

	it("rejects a task blocking itself", async () => {
		await expect(
			call("tasks_add_blocker", { task_id: "SPA-1", blocked_by: "SPA-1" }),
		).rejects.toMatchObject({
			body: { message: expect.stringContaining("cannot block itself") },
		});
	});
});
