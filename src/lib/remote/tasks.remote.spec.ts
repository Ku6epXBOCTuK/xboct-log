import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { statusCounts } from "../server/status-counts-test-kit";
import { closeTask, createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";
import { TASK_LIST_FIELDS } from "../server/tasks/field-names";

let dbDir: string;

beforeEach(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-fields-"));
	const db = getDb(join(dbDir, "fields.db"));
	await migrateDatabase(db);
	const project = createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	expect(project.isOk()).toBe(true);
	const task = createTask(db, {
		project_id: "spa",
		title: "Alpha",
		description: "first line\nsecond line",
	});
	expect(task.isOk()).toBe(true);
});

afterEach(() => {
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

async function list(input: unknown): Promise<Record<string, unknown>> {
	const result = (await runOp(op("tasks_list"), input, "mcp")) as {
		items: Record<string, unknown>[];
	};
	return result.items[0];
}

function fieldsDescription(): string {
	const schema = z.toJSONSchema(op("tasks_list").input) as unknown as {
		properties: { fields: { description: string } };
	};
	return schema.properties.fields.description;
}

describe("tasks_list fields parameter", () => {
	it("names every supported field in the parameter description", () => {
		const description = fieldsDescription();
		for (const field of TASK_LIST_FIELDS) {
			expect(description).toContain(field);
		}
	});

	it("documents the behavior for unknown field names", () => {
		expect(fieldsDescription()).toContain("Unknown field names are ignored");
	});

	it("matches the documented list with the returned task", async () => {
		const task = await list({
			include_project: true,
			include_scope: true,
			include_description: true,
		});
		expect(Object.keys(task).sort()).toEqual(
			TASK_LIST_FIELDS.filter((field) => field !== "short_description").sort(),
		);
	});

	it("documents the short description instead of the full text", async () => {
		const task = await list({ include_project: true, include_scope: true });
		const keys = Object.keys(task);
		expect(keys).toContain("short_description");
		expect(keys).not.toContain("description");
		expect(keys.sort()).toEqual(
			TASK_LIST_FIELDS.filter((field) => field !== "description").sort(),
		);
	});

	it("returns the full description instead of the short one on request", async () => {
		const task = await list({ include_description: true });
		expect(task.description).toBe("first line\nsecond line");
		expect(Object.keys(task)).not.toContain("short_description");
	});

	it("counts the children of an epic by status", async () => {
		const db = getDb();
		const epic = createTask(db, {
			project_id: "spa",
			title: "Epic",
			is_epic: true,
		});
		expect(epic.isOk()).toBe(true);
		const epicId = epic._unsafeUnwrap().id;
		const first = createTask(db, {
			project_id: "spa",
			title: "Open child",
			status: "open",
			epic_id: epicId,
		});
		expect(first.isOk()).toBe(true);
		const second = createTask(db, {
			project_id: "spa",
			title: "Busy child",
			epic_id: epicId,
			status: "in-progress",
		});
		expect(second.isOk()).toBe(true);
		const third = createTask(db, {
			project_id: "spa",
			title: "Done child",
			epic_id: epicId,
		});
		expect(third.isOk()).toBe(true);
		const closed = closeTask(db, third._unsafeUnwrap().id, "fixed");
		expect(closed.isOk()).toBe(true);

		const result = (await runOp(
			op("tasks_get"),
			{ task_id: epicId },
			"mcp",
		)) as {
			children_counts: Record<string, number>;
		};
		expect(result.children_counts).toEqual(
			statusCounts({ open: 1, "in-progress": 1, done: 1 }, 3),
		);

		const plain = (await runOp(
			op("tasks_get"),
			{ task_id: first._unsafeUnwrap().id },
			"mcp",
		)) as { children_counts?: unknown };
		expect(plain.children_counts).toBeUndefined();
	});

	it("keeps only the requested fields", async () => {
		const task = await list({ fields: "id,title,status" });
		expect(Object.keys(task).sort()).toEqual([
			"id",
			"number",
			"project_id",
			"status",
			"title",
		]);
	});

	it("always keeps the identity fields even when not requested", async () => {
		const task = await list({ fields: "title" });
		expect(Object.keys(task).sort()).toEqual([
			"id",
			"number",
			"project_id",
			"title",
		]);
	});

	it("ignores unknown field names", async () => {
		const task = await list({ fields: "id,bogus" });
		expect(Object.keys(task).sort()).toEqual(["id", "number", "project_id"]);
	});

	it("returns the whole task when no field name matches", async () => {
		const task = await list({ fields: "bogus" });
		expect(Object.keys(task)).toContain("title");
		expect(Object.keys(task)).toContain("status");
	});
});

describe("tasks_list source_file filter", () => {
	it("keeps only the tasks imported from a matching file", async () => {
		const db = getDb();
		const created = createTask(db, {
			project_id: "spa",
			title: "From backlog",
			source_file: "docs/backlog.md",
		});
		expect(created.isOk()).toBe(true);

		const result = (await runOp(
			op("tasks_list"),
			{ source_file: "backlog" },
			"mcp",
		)) as { items: Record<string, unknown>[] };

		expect(result.items.map((task) => task.title)).toEqual(["From backlog"]);
	});
});

describe("tasks_deleted_list", () => {
	it("returns only the deleted tasks and restores them", async () => {
		const db = getDb();
		const created = createTask(db, {
			project_id: "spa",
			title: "Gone for good",
		});
		expect(created.isOk()).toBe(true);
		const task = created._unsafeUnwrap();

		await runOp(op("tasks_delete"), { task_id: task.id }, "mcp");

		const listed = (await runOp(
			op("tasks_deleted_list"),
			{ project_id: "spa" },
			"mcp",
		)) as { items: Record<string, unknown>[]; total: number };

		expect(listed.total).toBe(1);
		expect(listed.items.map((item) => item.title)).toEqual(["Gone for good"]);

		await runOp(op("tasks_restore"), { task_id: task.id }, "mcp");

		const after = (await runOp(
			op("tasks_deleted_list"),
			{ project_id: "spa" },
			"mcp",
		)) as { items: Record<string, unknown>[]; total: number };

		expect(after.total).toBe(0);
		expect(after.items).toEqual([]);
	});
});

describe("estimate", () => {
	it("creates a task with an estimate and filters by it", async () => {
		const created = (await runOp(
			op("tasks_create"),
			{ project_id: "spa", title: "Sized by MCP", estimate: "M" },
			"mcp",
		)) as { estimate: string | null };

		expect(created.estimate).toBe("M");

		const result = (await runOp(
			op("tasks_list"),
			{ project_id: "spa", estimate: "M" },
			"mcp",
		)) as { items: Record<string, unknown>[] };

		expect(result.items.map((task) => task.title)).toEqual(["Sized by MCP"]);
	});

	it("rejects an estimate outside S, M and L", async () => {
		await expect(
			runOp(
				op("tasks_create"),
				{ project_id: "spa", title: "Bad", estimate: "XL" },
				"mcp",
			),
		).rejects.toBeDefined();
	});
});

describe("assignee and due date", () => {
	it("creates a task with an assignee and a due date and filters by them", async () => {
		const created = (await runOp(
			op("tasks_create"),
			{
				project_id: "spa",
				title: "Owned by MCP",
				assignee: "Ann",
				due_at: "2026-10-30",
			},
			"mcp",
		)) as { assignee: string | null; due_at: string | null };

		expect(created.assignee).toBe("Ann");
		expect(created.due_at).toBe("2026-10-30");

		const byAssignee = (await runOp(
			op("tasks_list"),
			{ project_id: "spa", assignee: "ann" },
			"mcp",
		)) as { items: Record<string, unknown>[] };
		expect(byAssignee.items.map((task) => task.title)).toEqual([
			"Owned by MCP",
		]);

		const byDue = (await runOp(
			op("tasks_list"),
			{ project_id: "spa", due_before: "2026-11-01" },
			"mcp",
		)) as { items: Record<string, unknown>[] };
		expect(byDue.items.map((task) => task.title)).toEqual(["Owned by MCP"]);
	});

	it("rejects a due date that is not a date", async () => {
		await expect(
			runOp(
				op("tasks_create"),
				{ project_id: "spa", title: "Bad date", due_at: "next tuesday" },
				"mcp",
			),
		).rejects.toBeDefined();
	});
});
