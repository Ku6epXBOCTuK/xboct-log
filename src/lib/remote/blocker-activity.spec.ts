import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActivity } from "../server/activity";
import { closeDb, getDb } from "../server/db";
import { type AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-blocker-activity-"));
	const db = getDb(join(dbDir, "activity.db"));
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

async function call(name: string, input: unknown): Promise<unknown> {
	return runOp(op(name), input, "mcp");
}

function history(taskId: string) {
	return listActivity(getDb(), { entity: "task", entity_id: taskId }).items;
}

describe("blocker activity details", () => {
	it("records which blocker was added", async () => {
		const db = getDb();
		const blocker = unwrap(
			createTask(db, { project_id: "spa", title: "Blocker" }),
		);
		const blocked = unwrap(
			createTask(db, { project_id: "spa", title: "Blocked" }),
		);

		await call("tasks_add_blocker", {
			task_id: blocked.id,
			blocked_by: blocker.id,
		});

		const entries = history(blocked.id);
		const added = entries.find((item) => item.op === "tasks_add_blocker");
		expect(added).toBeDefined();
		expect(added?.changes).toEqual([
			{ field: "blocked_by", from: [], to: [blocker.id] },
		]);
	});

	it("records the removed blocker and the released status", async () => {
		const db = getDb();
		const blocker = unwrap(
			createTask(db, { project_id: "spa", title: "Blocker two" }),
		);
		const blocked = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Blocked two",
				status: "open",
			}),
		);

		await call("tasks_add_blocker", {
			task_id: blocked.id,
			blocked_by: blocker.id,
		});
		await call("tasks_update", {
			task_id: blocked.id,
			patch: { status: "blocked" },
		});
		await call("tasks_remove_blocker", {
			task_id: blocked.id,
			blocked_by: blocker.id,
		});

		const entries = history(blocked.id);
		const removed = entries.find((item) => item.op === "tasks_remove_blocker");
		expect(removed?.changes).toEqual([
			{ field: "blocked_by", from: [blocker.id], to: [] },
			{ field: "status", from: "blocked", to: "open" },
		]);
	});

	it("records the links dropped when a task is deleted", async () => {
		const db = getDb();
		const blocker = unwrap(
			createTask(db, { project_id: "spa", title: "Blocker three" }),
		);
		const blocked = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Blocked three",
				status: "open",
			}),
		);

		await call("tasks_add_blocker", {
			task_id: blocked.id,
			blocked_by: blocker.id,
		});
		await call("tasks_update", {
			task_id: blocked.id,
			patch: { status: "blocked" },
		});

		const outcome = (await call("tasks_delete", { task_id: blocker.id })) as {
			id: string;
			deleted_at: string;
			changes: { field: string }[];
			released: { task_id: string }[];
		};

		expect(outcome.id).toBe(blocker.id);
		expect(outcome.changes.map((change) => change.field)).toContain(
			"deleted_at",
		);
		expect(outcome.released.map((link) => link.task_id)).toEqual([blocked.id]);

		const released = history(blocked.id).find(
			(item) => item.op === "tasks_delete",
		);
		expect(released?.changes).toEqual([
			{ field: "blocked_by", from: [blocker.id], to: [] },
			{ field: "status", from: "blocked", to: "open" },
		]);
	});

	it("records the epic link dropped when a task is deleted", async () => {
		const db = getDb();
		const epic = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Epic",
				is_epic: true,
			}),
		);
		const child = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);

		await call("tasks_delete", { task_id: epic.id });

		const detached = history(child.id).find(
			(item) => item.op === "tasks_delete",
		);
		expect(detached?.changes).toEqual([
			{ field: "epic_id", from: epic.id, to: null },
		]);
	});
});
