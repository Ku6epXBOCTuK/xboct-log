import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { closeTask, createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";
import { TASK_LIST_FIELDS } from "../server/tasks/field-names";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-fields-"));
	const db = getDb(join(dbDir, "fields.db"));
	await migrateDatabase(db);
	const project = createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	expect(project.isOk()).toBe(true);
	const boardProject = createProject(db, {
		id: "brd",
		name: "Board",
		prefix: "BRD",
	});
	expect(boardProject.isOk()).toBe(true);
	const task = createTask(db, {
		project_id: "spa",
		title: "Alpha",
		description: "first line\nsecond line",
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

		const result = (await runOp(op("tasks_get"), { id: epicId }, "mcp")) as {
			children_counts: Record<string, number>;
		};
		expect(result.children_counts).toEqual({
			open: 1,
			"in-progress": 1,
			blocked: 0,
			done: 1,
			cancelled: 0,
			total: 3,
		});

		const plain = (await runOp(
			op("tasks_get"),
			{ id: first._unsafeUnwrap().id },
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

		await runOp(op("tasks_delete"), { id: task.id }, "mcp");

		const listed = (await runOp(
			op("tasks_deleted_list"),
			{ project_id: "spa" },
			"mcp",
		)) as { items: Record<string, unknown>[]; total: number };

		expect(listed.total).toBe(1);
		expect(listed.items.map((item) => item.title)).toEqual(["Gone for good"]);

		await runOp(op("tasks_restore"), { id: task.id }, "mcp");

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

describe("tasks_board", () => {
	async function board(input: unknown): Promise<{
		columns: {
			status: string;
			count: number;
			items: Record<string, unknown>[];
		}[];
		total: number;
	}> {
		return (await runOp(op("tasks_board"), input, "mcp")) as never;
	}

	it("returns one column per status and counts the tasks", async () => {
		const db = getDb();
		const created = createTask(db, {
			project_id: "brd",
			title: "On the board",
			status: "in-progress",
		});
		expect(created.isOk()).toBe(true);

		const result = await board({ project_id: "brd" });

		expect(result.columns.map((column) => column.status)).toEqual([
			"open",
			"in-progress",
			"blocked",
			"done",
			"cancelled",
		]);
		const column = result.columns.find(
			(entry) => entry.status === "in-progress",
		);
		expect(column?.count).toBe(1);
		expect(column?.items.map((task) => task.title)).toEqual(["On the board"]);
		expect(result.total).toBe(1);
	});

	it("cuts the items of a column by the limit but keeps the count", async () => {
		const db = getDb();
		for (const title of ["One", "Two", "Three"]) {
			const created = createTask(db, { project_id: "brd", title });
			expect(created.isOk()).toBe(true);
		}

		const result = await board({ project_id: "brd", limit: 1 });

		const column = result.columns.find((entry) => entry.status === "open");
		expect(column?.count).toBe(3);
		expect(column?.items).toHaveLength(1);
	});

	it("keeps only the requested status columns", async () => {
		const result = await board({ status: ["open"] });

		expect(result.columns.map((column) => column.status)).toEqual(["open"]);
	});

	it("trims the items of a column by fields and keeps the identity", async () => {
		const result = await board({ status: ["open"], fields: "title" });

		const items = result.columns[0]?.items ?? [];
		expect(items.length).toBeGreaterThan(0);
		for (const item of items) {
			expect(Object.keys(item).sort()).toEqual([
				"id",
				"number",
				"project_id",
				"title",
			]);
		}
	});
});
