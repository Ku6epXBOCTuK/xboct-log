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
import { createTask, getTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-close-release-"));
	const db = getDb(join(dbDir, "close.db"));
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

interface Released {
	task_id: string;
	changes: { field: string; from: unknown; to: unknown }[];
}

async function blockedPair(title: string) {
	const db = getDb();
	const blocker = unwrap(
		createTask(db, { project_id: "spa", title: `${title} blocker` }),
	);
	const blocked = unwrap(
		createTask(db, { project_id: "spa", title: `${title} blocked` }),
	);
	await call("tasks_add_blocker", { id: blocked.id, blocked_by: blocker.id });
	await call("tasks_update", { id: blocked.id, patch: { status: "blocked" } });
	return { blocker, blocked };
}

describe("closed task releases blocked tasks", () => {
	it("returns the released task when the blocker is closed", async () => {
		const { blocker, blocked } = await blockedPair("Close one");

		const result = (await call("tasks_close", {
			id: blocker.id,
			reason: "fixed",
		})) as { released: Released[] };

		expect(result.released).toEqual([
			{
				task_id: blocked.id,
				changes: [{ field: "status", from: "blocked", to: "open" }],
			},
		]);
		const after = getTask(getDb(), blocked.id);
		expect(after?.status).toBe("open");
	});

	it("records the released status in the activity log", async () => {
		const { blocker, blocked } = await blockedPair("Close two");

		await call("tasks_close", { id: blocker.id, reason: "fixed" });

		const entry = history(blocked.id).find((item) => item.op === "tasks_close");
		expect(entry?.changes).toEqual([
			{ field: "status", from: "blocked", to: "open" },
		]);
	});

	it("returns the released task for tasks_close_many", async () => {
		const { blocker, blocked } = await blockedPair("Close three");

		const result = (await call("tasks_close_many", {
			items: [{ id: blocker.id, reason: "fixed" }],
		})) as {
			items: { id: string; ok: boolean; released?: Released[] }[];
		};

		expect(result.items[0].released).toEqual([
			{
				task_id: blocked.id,
				changes: [{ field: "status", from: "blocked", to: "open" }],
			},
		]);
		const entry = history(blocked.id).find(
			(item) => item.op === "tasks_close_many",
		);
		expect(entry?.changes).toEqual([
			{ field: "status", from: "blocked", to: "open" },
		]);
	});

	it("reports no released tasks when the closed task blocks nothing", async () => {
		const db = getDb();
		const lonely = unwrap(
			createTask(db, { project_id: "spa", title: "Lonely" }),
		);

		const result = (await call("tasks_close", {
			id: lonely.id,
			reason: "fixed",
		})) as { released: Released[] };

		expect(result.released).toEqual([]);
	});
});
