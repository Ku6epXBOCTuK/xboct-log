import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import type { AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask } from "../server/tasks";
import type { ActivitySource } from "../server/activity";
import type { ActivityItem } from "../types";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

interface ActivityRow {
	source: string;
	op: string;
	entity: string;
	entity_id: string;
	old_id: string | null;
	fields: string[];
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-activity-"));
	const db = getDb(join(dbDir, "activity.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
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

function rows(): ActivityRow[] {
	const found = getDb()
		.prepare(
			"SELECT source, op, entity, entity_id, old_id, fields FROM activity ORDER BY id",
		)
		.all() as unknown as (Omit<ActivityRow, "fields"> & { fields: string })[];
	return found.map((row) => ({ ...row, fields: JSON.parse(row.fields) }));
}

function clear(): void {
	getDb().exec("DELETE FROM activity");
}

describe("activity log", () => {
	it("records the same command from ui and mcp with different sources", async () => {
		const db = getDb();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Log me" }));
		clear();

		await call(
			"tasks_update",
			{ id: task.id, patch: { status: "done" } },
			"ui",
		);
		await call(
			"tasks_update",
			{ id: task.id, patch: { status: "open" } },
			"mcp",
		);

		expect(rows()).toEqual([
			{
				source: "ui",
				op: "tasks_update",
				entity: "task",
				entity_id: task.id,
				old_id: null,
				fields: ["status"],
			},
			{
				source: "mcp",
				op: "tasks_update",
				entity: "task",
				entity_id: task.id,
				old_id: null,
				fields: ["status"],
			},
		]);
	});

	it("does not record a failed command", async () => {
		clear();

		await expect(
			call("tasks_update", { id: "SPA-999", patch: { status: "done" } }),
		).rejects.toBeDefined();

		expect(rows()).toEqual([]);
	});

	it("records create with only the fields set beyond the defaults", async () => {
		clear();

		const task = (await call("tasks_create", {
			project_id: "spa",
			title: "Fresh",
			priority: "high",
		})) as { id: string };

		expect(rows()).toEqual([
			{
				source: "ui",
				op: "tasks_create",
				entity: "task",
				entity_id: task.id,
				old_id: null,
				fields: ["priority"],
			},
		]);
	});

	it("records one event per successful batch item", async () => {
		const db = getDb();
		const first = unwrap(
			createTask(db, { project_id: "spa", title: "Batch A" }),
		);
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Batch B" }),
		);
		clear();

		await call("tasks_update_many", {
			items: [
				{ id: first.id, patch: { priority: "low" } },
				{ id: "SPA-999", patch: { priority: "high" } },
				{ id: second.id, patch: { tags: ["x"] } },
			],
		});

		const logged = rows();
		expect(logged).toHaveLength(2);
		expect(logged.map((row) => row.entity_id)).toEqual([first.id, second.id]);
		expect(logged.map((row) => row.fields)).toEqual([["priority"], ["tags"]]);
	});

	it("records per-item fields for create_many and close_many", async () => {
		clear();

		const created = (await call("tasks_create_many", {
			items: [
				{ project_id: "spa", title: "Many A" },
				{ project_id: "bil", title: "Many B", priority: "low" },
			],
		})) as { items: { task: { id: string } }[] };
		const ids = created.items.map((item) => item.task.id);

		await call("tasks_close_many", {
			items: [
				{ id: ids[0], reason: "fixed" },
				{ id: "SPA-999", reason: "fixed" },
				{ id: ids[1], reason: "wontfix" },
			],
		});

		const logged = rows();
		expect(logged.slice(0, 2)).toEqual([
			{
				source: "ui",
				op: "tasks_create_many",
				entity: "task",
				entity_id: ids[0],
				old_id: null,
				fields: [],
			},
			{
				source: "ui",
				op: "tasks_create_many",
				entity: "task",
				entity_id: ids[1],
				old_id: null,
				fields: ["priority"],
			},
		]);
		expect(logged.slice(2).map((row) => row.entity_id)).toEqual(ids);
		expect(logged.slice(2).map((row) => row.fields)).toEqual([
			["status", "closed_reason"],
			["status", "closed_reason"],
		]);
	});

	it("records close with status and reason", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Close me" }),
		);
		clear();

		await call("tasks_close", { id: task.id, reason: "fixed" });

		expect(rows()[0]).toMatchObject({
			entity: "task",
			entity_id: task.id,
			fields: ["status", "closed_reason"],
		});
	});

	it("records delete with deleted_at", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Delete me" }),
		);
		clear();

		await call("tasks_delete", { id: task.id });

		expect(rows()[0]).toMatchObject({
			entity: "task",
			entity_id: task.id,
			fields: ["deleted_at"],
		});
	});

	it("records move with the old id and the new id", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Move me" }),
		);
		clear();

		const moved = (await call("tasks_move", {
			id: task.id,
			project_id: "bil",
		})) as { id: string };

		expect(rows()[0]).toMatchObject({
			entity: "task",
			entity_id: moved.id,
			old_id: task.id,
			fields: ["project_id"],
		});
	});

	it("records blocker changes on the blocked task", async () => {
		const db = getDb();
		const blocker = unwrap(
			createTask(db, { project_id: "spa", title: "Blocker" }),
		);
		const blocked = unwrap(
			createTask(db, { project_id: "spa", title: "Blocked" }),
		);
		clear();

		await call("tasks_add_blocker", {
			id: blocked.id,
			blocked_by: blocker.id,
		});
		await call("tasks_remove_blocker", {
			id: blocked.id,
			blocked_by: blocker.id,
		});

		expect(rows().map((row) => [row.op, row.entity_id, row.fields])).toEqual([
			["tasks_add_blocker", blocked.id, ["blocked_by"]],
			["tasks_remove_blocker", blocked.id, ["blocked_by"]],
		]);
	});

	it("keeps the client name of an mcp call and leaves it empty for ui", async () => {
		const db = getDb();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Client" }));
		clear();

		await runOp(
			op("tasks_update"),
			{ id: task.id, patch: { status: "done" } },
			"mcp",
			"vitest/1.2.3",
		);
		await call("tasks_update", { id: task.id, patch: { status: "open" } });

		const history = (await call("tasks_history", { id: task.id })) as {
			items: ActivityItem[];
		};
		expect(history.items.map((item) => item.client)).toEqual([
			null,
			"vitest/1.2.3",
		]);

		const log = (await call("activity_list", { source: "mcp" })) as {
			items: ActivityItem[];
		};
		expect(log.items[0].client).toBe("vitest/1.2.3");
	});

	it("reads the history of a task without logging the read", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "History" }),
		);
		clear();

		await call(
			"tasks_update",
			{ id: task.id, patch: { status: "done" } },
			"mcp",
		);
		const history = (await call("tasks_history", { id: task.id })) as {
			items: ActivityItem[];
			total: number;
		};

		expect(history.total).toBe(1);
		expect(history.items[0]).toMatchObject({
			source: "mcp",
			op: "tasks_update",
			fields: ["status"],
			old_id: null,
		});
		expect(rows()).toHaveLength(1);
	});

	it("follows the history of a moved task", async () => {
		const db = getDb();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Mover" }));
		clear();

		const moved = (await call("tasks_move", {
			id: task.id,
			project_id: "bil",
		})) as { id: string };
		const history = (await call("tasks_history", {
			id: moved.id,
		})) as { items: ActivityItem[]; total: number };

		expect(history.total).toBe(1);
		expect(history.items[0]).toMatchObject({
			op: "tasks_move",
			fields: ["project_id"],
			old_id: task.id,
		});
	});

	it("records project and scope changes", async () => {
		clear();

		await call("projects_create", {
			id: "new",
			name: "New",
			prefix: "NEW",
		});
		await call("projects_update", { id: "new", patch: { archived: true } });
		const scope = (await call("scopes_create", {
			project_id: "spa",
			name: "ux",
		})) as { id: number };
		await call("scopes_update", { id: scope.id, patch: { name: "design" } });
		await call("scopes_delete", { id: scope.id });

		expect(
			rows().map((row) => [row.op, row.entity, row.entity_id, row.fields]),
		).toEqual([
			["projects_create", "project", "new", ["id", "name", "prefix"]],
			["projects_update", "project", "new", ["archived"]],
			["scopes_create", "scope", String(scope.id), ["project_id", "name"]],
			["scopes_update", "scope", String(scope.id), ["name"]],
			["scopes_delete", "scope", String(scope.id), []],
		]);
	});

	it("lists the whole log with filters and pagination", async () => {
		const db = getDb();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Listed" }));
		clear();

		await call(
			"tasks_update",
			{ id: task.id, patch: { status: "done" } },
			"ui",
		);
		await call(
			"tasks_update",
			{ id: task.id, patch: { title: "Renamed" } },
			"mcp",
		);
		await call("projects_update", { id: "spa", patch: { name: "Shop" } }, "ui");

		const all = (await call("activity_list", {})) as {
			items: { op: string; entity: string }[];
			total: number;
			ops: string[];
		};

		expect(all.total).toBe(3);
		expect(all.ops).toEqual(["projects_update", "tasks_update"]);
		expect(all.items[0].op).toBe("projects_update");

		const filtered = (await call("activity_list", { source: "mcp" })) as {
			items: { op: string }[];
			total: number;
		};

		expect(filtered.total).toBe(1);
		expect(filtered.items[0].op).toBe("tasks_update");

		const page = (await call("activity_list", { limit: 2, offset: 0 })) as {
			items: unknown[];
			total: number;
		};

		expect(page.items).toHaveLength(2);
		expect(page.total).toBe(3);
	});
});
