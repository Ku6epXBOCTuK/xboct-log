import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { type AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask, ensureTag } from "../server/tasks";
import type { ActivityChange, ActivitySource } from "../types";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-comments-"));
	const db = getDb(join(dbDir, "comments.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	for (const tag of ["a", "b"]) {
		unwrap(ensureTag(db, tag));
	}
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

async function call(
	name: string,
	input: unknown,
	source: ActivitySource = "ui",
): Promise<unknown> {
	return runOp(op(name), input, source);
}

interface ActivityRow {
	source: string;
	op: string;
	entity: string;
	entity_id: string;
	fields: string[];
	changes: ActivityChange[];
}

function rows(): ActivityRow[] {
	const found = getDb()
		.prepare(
			"SELECT source, op, entity, entity_id, fields, changes FROM activity ORDER BY id",
		)
		.all() as unknown as {
		source: string;
		op: string;
		entity: string;
		entity_id: string;
		fields: string;
		changes: string;
	}[];
	return found.map((row) => ({
		source: row.source,
		op: row.op,
		entity: row.entity,
		entity_id: row.entity_id,
		fields: JSON.parse(row.fields),
		changes: JSON.parse(row.changes),
	}));
}

function clear(): void {
	getDb().exec("DELETE FROM activity");
}

describe("comment operations", () => {
	it("adds, lists, edits and deletes a comment", async () => {
		const db = getDb();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Chat" }));
		clear();

		const added = (await call("tasks_comments_add", {
			task_id: task.id,
			body: "first",
		})) as { id: string; body: string };

		expect(added.body).toBe("first");

		const listed = (await call("tasks_comments_list", {
			task_id: task.id,
		})) as { items: { id: string; body: string }[]; total: number };
		expect(listed.total).toBe(1);
		expect(listed.items[0].body).toBe("first");

		const edited = (await call("tasks_comments_edit", {
			comment_id: added.id,
			body: "second",
		})) as { body: string; edited_at: string | null };
		expect(edited.body).toBe("second");
		expect(edited.edited_at).not.toBeNull();

		const deleted = (await call("tasks_comments_delete", {
			comment_id: added.id,
		})) as { deleted_at: string | null };
		expect(deleted.deleted_at).not.toBeNull();

		const after = (await call("tasks_comments_list", {
			task_id: task.id,
		})) as { items: unknown[]; total: number };
		expect(after.total).toBe(0);
	});

	it("records every comment operation in the activity log", async () => {
		const db = getDb();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Logged" }));
		clear();

		const added = (await call(
			"tasks_comments_add",
			{ task_id: task.id, body: "note" },
			"mcp",
		)) as { id: string };
		await call("tasks_comments_edit", { comment_id: added.id, body: "edited" });
		await call("tasks_comments_delete", { comment_id: added.id });

		expect(rows().map((row) => [row.op, row.entity, row.entity_id])).toEqual([
			["tasks_comments_add", "task", task.id],
			["tasks_comments_edit", "task", task.id],
			["tasks_comments_delete", "task", task.id],
		]);
		expect(rows()[0].source).toBe("mcp");
		expect(rows().every((row) => row.fields[0] === "comments")).toBe(true);
	});

	it("rejects an empty comment and an unknown task", async () => {
		await expect(
			call("tasks_comments_add", { task_id: "SPA-1", body: "  " }),
		).rejects.toBeDefined();
		await expect(
			call("tasks_comments_add", { task_id: "SPA-999", body: "x" }),
		).rejects.toBeDefined();
	});
});

describe("activity changes", () => {
	it("stores the old and the new value of the changed fields", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Old",
				status: "open",
				priority: "low",
				tags: ["a"],
			}),
		);
		clear();

		await call("tasks_update", {
			task_id: task.id,
			patch: {
				title: "New",
				status: "in-progress",
				priority: "high",
				tags: ["a", "b"],
			},
		});

		expect(rows()[0].changes).toEqual([
			{ field: "title", from: "Old", to: "New" },
			{ field: "status", from: "open", to: "in-progress" },
			{ field: "priority", from: "low", to: "high" },
			{ field: "tags", from: ["a"], to: ["a", "b"] },
		]);
	});

	it("stores no change when the patch changes nothing", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Same", priority: "low" }),
		);
		clear();

		await call("tasks_update", {
			task_id: task.id,
			patch: { title: "Same", priority: "low" },
		});

		expect(rows()[0].changes).toEqual([]);
	});

	it("stores the closing status and reason", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Close",
				status: "open",
			}),
		);
		clear();

		await call("tasks_close", { task_id: task.id, reason: "wontfix" });

		expect(rows()[0].changes).toEqual([
			{ field: "status", from: "open", to: "cancelled" },
			{ field: "closed_reason", from: null, to: "wontfix" },
		]);
	});
});
