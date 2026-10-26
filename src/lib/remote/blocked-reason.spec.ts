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
import { BLOCKED_REASON_MAX_LENGTH, type Task } from "../types";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-blocked-reason-"));
	const db = getDb(join(dbDir, "blocked.db"));
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

async function failure(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		const body = (error as { body?: { message?: string } }).body;
		return body?.message ?? String(error);
	}
	throw new Error("expected the call to fail");
}

interface Updated extends Task {
	changes: { field: string; from: unknown; to: unknown }[];
	warnings: string[];
}

describe("blocked_reason", () => {
	it("stores the reason of a task blocked outside the tracker", async () => {
		const created = (await call("tasks_create", {
			project_id: "spa",
			title: "Wait for the release",
			status: "blocked",
			blocked_reason: "release 2.4 is not out yet",
		})) as Updated;

		expect(created.blocked_reason).toBe("release 2.4 is not out yet");
		expect(created.warnings).toEqual([]);
	});

	it("warns when a task is blocked with no blocker and no reason", async () => {
		const created = (await call("tasks_create", {
			project_id: "spa",
			title: "Blocked with nothing",
			status: "blocked",
		})) as Updated;

		expect(created.blocked_reason ?? null).toBeNull();
		expect(created.warnings).toHaveLength(1);
		expect(created.warnings[0]).toContain("blocked_reason");
	});

	it("rejects a reason on a task that is not blocked", async () => {
		const task = unwrap(
			createTask(getDb(), { project_id: "spa", title: "Open" }),
		);

		const message = await failure(
			call("tasks_update", {
				id: task.id,
				patch: { blocked_reason: "no" },
			}),
		);
		expect(message).toContain("blocked_reason");
	});

	it("rejects a reason longer than the limit", async () => {
		const message = await failure(
			call("tasks_create", {
				project_id: "spa",
				title: "Too long",
				status: "blocked",
				blocked_reason: "x".repeat(BLOCKED_REASON_MAX_LENGTH + 1),
			}),
		);
		expect(message).toContain("blocked_reason");
	});

	it("clears the reason when the task leaves blocked", async () => {
		const task = unwrap(
			createTask(getDb(), {
				project_id: "spa",
				title: "Leaves blocked",
				status: "blocked",
				blocked_reason: "waiting for access",
			}),
		);

		const updated = (await call("tasks_update", {
			id: task.id,
			patch: { status: "open" },
		})) as Updated;

		expect(updated.blocked_reason ?? null).toBeNull();
		expect(updated.changes).toContainEqual({
			field: "blocked_reason",
			from: "waiting for access",
			to: null,
		});
		expect(getTask(getDb(), task.id)?.blocked_reason ?? null).toBeNull();
	});

	it("keeps the reason of a blocked task in the activity log", async () => {
		const task = unwrap(
			createTask(getDb(), { project_id: "spa", title: "History" }),
		);

		await call("tasks_update", {
			id: task.id,
			patch: { status: "blocked", blocked_reason: "awaiting DBA" },
		});

		const entry = listActivity(getDb(), {
			entity: "task",
			entity_id: task.id,
		}).items[0];
		expect(entry.changes).toContainEqual({
			field: "blocked_reason",
			from: null,
			to: "awaiting DBA",
		});
	});

	it("clears the reason when closing the blocker releases the task", async () => {
		const db = getDb();
		const blocker = unwrap(
			createTask(db, { project_id: "spa", title: "Blocker" }),
		);
		const blocked = unwrap(
			createTask(db, { project_id: "spa", title: "Blocked", status: "open" }),
		);
		await call("tasks_add_blocker", { id: blocked.id, blocked_by: blocker.id });
		await call("tasks_update", {
			id: blocked.id,
			patch: { status: "blocked", blocked_reason: "waiting for the blocker" },
		});

		await call("tasks_close", { id: blocker.id, reason: "fixed" });

		const after = getTask(db, blocked.id);
		expect(after?.status).toBe("open");
		expect(after?.blocked_reason ?? null).toBeNull();
	});
});
