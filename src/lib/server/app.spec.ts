import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openMigratedDatabase } from "./migrations";
import { type AppError } from "./errors";
import {
	createProject,
	getProject,
	listProjects,
	updateProject,
} from "./projects";
import { createScope } from "./scopes";
import {
	closeTask,
	closeTasksMany,
	countTasks,
	countEpicsByStatus,
	countTasksByStatus,
	createTask,
	createTasksMany,
	deleteTask,
	ensureTag,
	getTask,
	getTasksByIds,
	listTasks,
	moveTask,
	updateTask,
	updateTasksMany,
} from "./tasks";
import { addLink, removeLink } from "./links";
import { statusCounts } from "./status-counts-test-kit";
import { SHORT_DESCRIPTION_LENGTH } from "./tasks/rows";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

function failure(result: Result<unknown, AppError>): AppError {
	expect(result.isErr()).toBe(true);
	return result._unsafeUnwrapErr();
}

async function setup(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	for (const tag of ["perf", "checkout", "x", "a11y"]) {
		unwrap(ensureTag(db, tag));
	}
	return db;
}

describe("projects", () => {
	it("creates a project and reads it back", async () => {
		const db = await openMigratedDatabase(":memory:");
		const project = unwrap(
			createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }),
		);

		expect(project).toMatchObject({ id: "spa", name: "Shop", prefix: "SPA" });
		expect(project.archived_at).toBeNull();
		expect(getProject(db, "spa")).toEqual(project);
	});

	it("returns a conflict for a duplicate prefix", async () => {
		const db = await setup();
		const error = failure(
			createProject(db, { id: "other", name: "Other", prefix: "SPA" }),
		);

		expect(error.kind).toBe("conflict");
		expect(error.status).toBe(409);
	});

	it("stores the prefix uppercase and rejects a case-insensitive clash", async () => {
		const db = await setup();
		const project = unwrap(
			createProject(db, { id: "blog", name: "Blog", prefix: "blog" }),
		);

		expect(project.prefix).toBe("BLOG");
		expect(unwrap(createTask(db, { project_id: "blog", title: "A" })).id).toBe(
			"BLOG-1",
		);

		const error = failure(
			createProject(db, { id: "blog2", name: "Blog 2", prefix: "BlOg" }),
		);
		expect(error.kind).toBe("conflict");
	});

	it("blocks a case-variant prefix inserted directly in the database", async () => {
		const db = await setup();

		expect(() =>
			db
				.prepare(
					"INSERT INTO projects (id, name, prefix, created_at) VALUES (?, ?, ?, ?)",
				)
				.run("manual", "Manual", "spa", new Date().toISOString()),
		).toThrow();
	});

	it("blocks a lowercase prefix inserted directly in the database", async () => {
		const db = await setup();

		expect(() =>
			db
				.prepare(
					"INSERT INTO projects (id, name, prefix, created_at) VALUES (?, ?, ?, ?)",
				)
				.run("manual", "Manual", "man", new Date().toISOString()),
		).toThrow(/uppercase/);
	});

	it("returns a validation error for an invalid id", async () => {
		const db = await openMigratedDatabase(":memory:");
		const error = failure(
			createProject(db, { id: "bad id!", name: "Bad", prefix: "BAD" }),
		);

		expect(error.kind).toBe("validation");
		expect(error.message).toContain("latin letters");
	});

	it("rejects a prefix that is not 1-6 letters or digits", async () => {
		const db = await openMigratedDatabase(":memory:");

		for (const prefix of ["A-B", "ABCDEFG", "AB CD"]) {
			const error = failure(
				createProject(db, { id: "shop", name: "Shop", prefix }),
			);
			expect(error.kind).toBe("validation");
			expect(error.message).toContain("1-6");
		}
	});

	it("returns not_found when updating a missing project", async () => {
		const db = await openMigratedDatabase(":memory:");
		const error = failure(updateProject(db, "ghost", { name: "Ghost" }));

		expect(error.kind).toBe("not_found");
	});

	it("archives a project and hides it from the default list", async () => {
		const db = await setup();
		unwrap(updateProject(db, "spa", { archived: true }));

		expect(listProjects(db)).toHaveLength(0);
		expect(listProjects(db, { includeArchived: true })).toHaveLength(1);
	});

	it("renames and restores a project", async () => {
		const db = await setup();
		expect(
			unwrap(updateProject(db, "spa", { archived: true })).archived_at,
		).not.toBeNull();

		expect(
			unwrap(updateProject(db, "spa", { name: " Storefront " })).name,
		).toBe("Storefront");

		const restored = unwrap(updateProject(db, "spa", { archived: false }));
		expect(restored.archived_at).toBeNull();
		expect(listProjects(db)).toHaveLength(1);
	});
});

describe("tasks", () => {
	it("generates sequential ids per project", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "First" }));
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Second" }),
		);

		expect(first.id).toBe("SPA-1");
		expect(second.id).toBe("SPA-2");
		expect(first.number).toBe(1);
	});

	it("applies defaults and round-trips arrays and source", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Fix checkout",
				tags: ["perf", "perf", " checkout "],
				source_file: "src/cart.ts",
			}),
		);

		expect(task.status).toBe("backlog");
		expect(task.priority).toBe("medium");
		expect(task.tags).toEqual(["checkout", "perf"]);
		expect(task.source_file).toBe("src/cart.ts");
		expect(task.closed_at).toBeNull();
		expect(getTask(db, task.id)).toEqual(task);
	});

	it("stores the estimate and rejects an unknown one", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Small", estimate: "S" }),
		);

		expect(task.estimate).toBe("S");

		const error = failure(
			createTask(db, {
				project_id: "spa",
				title: "Wrong",
				estimate: "XL" as never,
			}),
		);
		expect(error.kind).toBe("validation");
	});

	it("changes and clears the estimate", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Sized" }));
		expect(task.estimate).toBeNull();

		const updated = unwrap(updateTask(db, task.id, { estimate: "L" }));
		expect(updated.estimate).toBe("L");

		const cleared = unwrap(updateTask(db, task.id, { estimate: null }));
		expect(cleared.estimate).toBeNull();
	});

	it("filters tasks by estimate", async () => {
		const db = await setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "Small", estimate: "S" }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "Medium", estimate: "M" }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Unmeasured" }));

		const small = listTasks(db, { estimate: ["S"] });
		expect(small.map((task) => task.title)).toEqual(["Small"]);

		const both = listTasks(db, { estimate: ["S", "M"] });
		expect(both.map((task) => task.title).sort()).toEqual(["Medium", "Small"]);
	});

	it("stores the assignee and the due date", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Owned",
				assignee: "Ann",
				due_at: "2026-10-30",
			}),
		);

		expect(task.assignee).toBe("Ann");
		expect(task.due_at).toBe("2026-10-30");
	});

	it("cuts a full timestamp to the day and rejects an impossible date", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Stamped",
				due_at: "2026-10-30T18:45:00Z",
			}),
		);

		expect(task.due_at).toBe("2026-10-30");

		const error = failure(
			createTask(db, {
				project_id: "spa",
				title: "Broken",
				due_at: "2026-13-40",
			}),
		);
		expect(error.kind).toBe("validation");
	});

	it("changes and clears the assignee and the due date", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Owned" }));

		const updated = unwrap(
			updateTask(db, task.id, { assignee: "Bob", due_at: "2026-11-01" }),
		);
		expect(updated.assignee).toBe("Bob");
		expect(updated.due_at).toBe("2026-11-01");

		const cleared = unwrap(
			updateTask(db, task.id, { assignee: null, due_at: null }),
		);
		expect(cleared.assignee).toBeNull();
		expect(cleared.due_at).toBeNull();
	});

	it("filters tasks by assignee and due date", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Soon",
				assignee: "Ann",
				due_at: "2026-10-20",
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Later",
				assignee: "Bob",
				due_at: "2026-11-20",
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Nobody" }));

		expect(
			listTasks(db, { assignee: ["ann"] }).map((task) => task.title),
		).toEqual(["Soon"]);
		expect(
			listTasks(db, { due_before: "2026-11-01" }).map((task) => task.title),
		).toEqual(["Soon"]);
		expect(
			listTasks(db, { due_after: "2026-11-01" }).map((task) => task.title),
		).toEqual(["Later"]);
	});

	it("returns not_found for an unknown project", async () => {
		const db = await openMigratedDatabase(":memory:");
		const error = failure(createTask(db, { project_id: "ghost", title: "X" }));

		expect(error.kind).toBe("not_found");
	});

	it("stamps closed_at on close and clears it on reopen", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		const closed = unwrap(updateTask(db, task.id, { status: "done" }));
		expect(closed.closed_at).not.toBeNull();

		const reopened = unwrap(updateTask(db, task.id, { status: "open" }));
		expect(reopened.closed_at).toBeNull();
	});

	it("closes with a reason and clears it on reopen", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		const closed = unwrap(closeTask(db, task.id, "obsolete"));
		expect(closed.status).toBe("cancelled");
		expect(closed.closed_reason).toBe("obsolete");
		expect(closed.closed_at).not.toBeNull();

		const reopened = unwrap(updateTask(db, task.id, { status: "open" }));
		expect(reopened.closed_at).toBeNull();
		expect(reopened.closed_reason).toBeNull();
	});

	it("maps the fixed reason to done", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		expect(unwrap(closeTask(db, task.id, "fixed")).status).toBe("done");
	});

	it("maps the wontfix reason to cancelled", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		const closed = unwrap(closeTask(db, task.id, "wontfix"));

		expect(closed.status).toBe("cancelled");
		expect(closed.closed_reason).toBe("wontfix");
	});

	it("maps the not-reproduced reason to cancelled", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		const closed = unwrap(closeTask(db, task.id, "not-reproduced"));

		expect(closed.status).toBe("cancelled");
		expect(closed.closed_reason).toBe("not-reproduced");
	});

	it("returns not_found when closing a missing task", async () => {
		const db = await setup();

		expect(failure(closeTask(db, "SPA-9", "fixed")).kind).toBe("not_found");
	});

	it("closes several tasks and reports per-item results", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		const results = closeTasksMany(db, [
			{ id: first.id, reason: "fixed" },
			{ id: "SPA-9", reason: "fixed" },
			{ id: second.id, reason: "wontfix" },
		]);

		expect(results).toHaveLength(3);
		expect(results[0]).toMatchObject({ id: first.id, ok: true });
		expect(results[1]).toMatchObject({
			id: "SPA-9",
			ok: false,
			error: { kind: "not_found" },
		});
		expect(results[2]).toMatchObject({ id: second.id, ok: true });
		expect(getTask(db, first.id)?.status).toBe("done");
		expect(getTask(db, second.id)?.status).toBe("cancelled");
	});

	it("updates several tasks and skips failing items", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const results = updateTasksMany(db, [
			{ id: first.id, patch: { priority: "high" } },
			{ id: "SPA-9", patch: { priority: "low" } },
		]);

		expect(results[0]).toMatchObject({ id: first.id, ok: true });
		expect(results[1]).toMatchObject({
			id: "SPA-9",
			ok: false,
			error: { kind: "not_found" },
		});
		expect(getTask(db, first.id)?.priority).toBe("high");
	});

	it("creates several tasks and skips failing items", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));

		const results = createTasksMany(db, [
			{ project_id: "spa", title: "A", tags: ["x"] },
			{ project_id: "nope", title: "B" },
			{ project_id: "bil", title: "C" },
		]);

		expect(results).toHaveLength(3);
		expect(results[0]).toMatchObject({ index: 0, ok: true });
		expect(results[1]).toMatchObject({
			index: 1,
			ok: false,
			error: { kind: "not_found" },
		});
		expect(results[2]).toMatchObject({ index: 2, ok: true });
		expect(getTask(db, "SPA-1")?.tags).toEqual(["x"]);
		expect(getTask(db, "BIL-1")?.title).toBe("C");
	});

	it("creates tasks in order and numbers them sequentially", async () => {
		const db = await setup();

		const results = createTasksMany(db, [
			{ project_id: "spa", title: "A" },
			{ project_id: "spa", title: "B" },
		]);

		expect(results[0]).toMatchObject({ index: 0, ok: true });
		expect(results[1]).toMatchObject({ index: 1, ok: true });
		expect(getTask(db, "SPA-1")?.title).toBe("A");
		expect(getTask(db, "SPA-2")?.title).toBe("B");
	});

	it("returns requested tasks in order and lists missing ids", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		const gone = unwrap(createTask(db, { project_id: "spa", title: "Gone" }));
		unwrap(deleteTask(db, gone.id));

		const result = getTasksByIds(db, [second.id, first.id, "SPA-9", gone.id]);

		expect(result.items.map((task) => task.id)).toEqual([second.id, first.id]);
		expect(result.missing).toEqual(["SPA-9", gone.id]);
	});

	it("soft deletes a task and detaches its epic children", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: epic.id }),
		);

		expect(unwrap(deleteTask(db, epic.id))).toBe(epic.id);
		expect(getTask(db, epic.id)).toBeUndefined();
		expect(listTasks(db)).toHaveLength(1);
		expect(getTask(db, child.id)?.epic_id).toBeNull();
		expect(failure(deleteTask(db, epic.id)).kind).toBe("not_found");
	});

	it("keeps a deleted task in the table with deleted_at set", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Trash" }));

		unwrap(deleteTask(db, task.id));

		expect(listTasks(db)).toHaveLength(0);
		const [deleted] = listTasks(db, { include_deleted: true });
		expect(deleted.id).toBe(task.id);
		expect(deleted.deleted_at).not.toBeNull();
	});

	it("rejects a deleted task as an epic parent", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Gone", is_epic: true }),
		);
		unwrap(deleteTask(db, epic.id));

		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: epic.id }),
		);

		expect(error.kind).toBe("not_found");
	});

	it("rejects an epic from another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "bil", title: "Big", is_epic: true }),
		);
		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: epic.id }),
		);

		expect(error.message).toBe("epic must belong to the same project");
	});

	it("rejects a non-epic as epic parent", async () => {
		const db = await setup();
		const plain = unwrap(createTask(db, { project_id: "spa", title: "Plain" }));
		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: plain.id }),
		);

		expect(error.message).toContain("is not an epic");
	});

	it("rejects a task as its own epic", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Loop" }));
		const error = failure(
			updateTask(db, task.id, { is_epic: true, epic_id: task.id }),
		);

		expect(error.message).toBe("a task cannot be its own epic");
	});

	it("filters by status, tag and text", async () => {
		const db = await setup();
		const alpha = unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "Alpha bug",
				tags: ["perf"],
			}),
		);
		const beta = unwrap(
			createTask(db, { project_id: "spa", title: "Beta", tags: ["a11y"] }),
		);
		unwrap(updateTask(db, beta.id, { status: "done" }));

		expect(listTasks(db, { status: ["open"] })).toHaveLength(1);
		expect(listTasks(db, { tag: ["a11y"] })).toHaveLength(1);
		expect(listTasks(db, { q: "alpha" })).toHaveLength(1);
		expect(listTasks(db, { q: alpha.id })).toHaveLength(1);
		expect(listTasks(db, { q: "a11y" })).toHaveLength(1);
		expect(listTasks(db, { q: "perf" })).toHaveLength(1);
		expect(listTasks(db, { project_id: "spa" })).toHaveLength(2);
	});

	it("finds tasks by the id of their epic", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);

		expect(listTasks(db, { q: epic.id })).toHaveLength(2);
		expect(listTasks(db, { q: "Revamp" })).toHaveLength(1);
	});

	it("counts all matches ignoring limit and offset", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));
		unwrap(createTask(db, { project_id: "spa", title: "Beta" }));
		unwrap(createTask(db, { project_id: "spa", title: "Gamma" }));

		expect(countTasks(db, { project_id: "spa" })).toBe(3);
		expect(countTasks(db, { q: "a" })).toBe(3);
		expect(listTasks(db, { project_id: "spa", limit: 1 })).toHaveLength(1);
		expect(countTasks(db, { project_id: "spa", limit: 1, offset: 1 })).toBe(3);
		expect(countTasks(db, { project_id: "spa", q: "alpha" })).toBe(1);
	});

	it("filters epics and their children", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Loose" }));

		expect(listTasks(db, { is_epic: true }).map((task) => task.id)).toEqual([
			epic.id,
		]);
		expect(listTasks(db, { is_epic: false })).toHaveLength(2);
		expect(
			listTasks(db, { epic_id: epic.id }).map((task) => task.title),
		).toEqual(["Child"]);
	});

	it("attaches project names without hiding archived projects", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));
		unwrap(createProject(db, { id: "old", name: "Old", prefix: "OLD" }));
		unwrap(createTask(db, { project_id: "old", title: "Legacy" }));
		unwrap(updateProject(db, "old", { archived: true }));

		const withNames = listTasks(db, { include_project: true });

		expect(withNames.map((task) => task.project_name).sort()).toEqual([
			"Old",
			"Shop",
		]);
		expect(
			listTasks(db, { project_archived: false }).map((task) => task.title),
		).toEqual(["Alpha"]);
		expect(
			listTasks(db, { project_archived: true }).map((task) => task.title),
		).toEqual(["Legacy"]);
	});

	it("omits project_name unless the project is joined", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));

		const [task] = listTasks(db, { fields: "id,project_name" });

		expect(Object.keys(task)).toEqual(["id", "project_id", "number"]);
	});

	it("attaches scope names when requested", async () => {
		const db = await setup();
		const scope = unwrap(createScope(db, { project_id: "spa", name: "ux" }));
		unwrap(
			createTask(db, { project_id: "spa", title: "Alpha", scope_id: scope.id }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Beta" }));

		const tasks = listTasks(db, { include_scope: true });

		expect(tasks.find((task) => task.title === "Alpha")?.scope_name).toBe("ux");
		expect(
			tasks.find((task) => task.title === "Beta")?.scope_name,
		).toBeUndefined();
	});

	it("keeps filters unambiguous when scopes and projects are joined", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const scope = unwrap(createScope(db, { project_id: "spa", name: "ux" }));
		unwrap(
			createTask(db, { project_id: "spa", title: "Alpha", scope_id: scope.id }),
		);
		unwrap(createTask(db, { project_id: "bil", title: "Beta" }));

		const joined = listTasks(db, {
			project_id: "spa",
			include_scope: true,
			include_project: true,
			include_description: true,
		});

		expect(joined.map((task) => task.title)).toEqual(["Alpha"]);
		expect(
			listTasks(db, { project_id: "spa", include_scope: true, q: "Alpha" }),
		).toHaveLength(1);
		expect(
			listTasks(db, { scope_id: scope.id, include_scope: true }).map(
				(task) => task.title,
			),
		).toEqual(["Alpha"]);
		expect(countTasks(db, { project_id: "spa", include_scope: true })).toBe(1);
	});

	it("limits the response to the requested fields", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));

		const found = listTasks(db, {
			title: "alpha",
			fields: "id,number,title,status,project_id,updated_at",
		});

		expect(found).toHaveLength(1);
		expect(Object.keys(found[0]).sort()).toEqual([
			"id",
			"number",
			"project_id",
			"status",
			"title",
			"updated_at",
		]);
	});

	it("ignores unknown field names", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));

		const [task] = listTasks(db, { fields: "id,bogus" });

		expect(Object.keys(task)).toEqual(["id", "project_id", "number"]);
		expect(listTasks(db, { fields: "bogus" }).map((item) => item.id)).toEqual([
			"SPA-1",
		]);
	});

	it("returns short_description instead of the full description by default", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				description: "first line\nsecond line",
			}),
		);

		const [task] = listTasks(db, { title: "alpha" });

		expect(task.description).toBeUndefined();
		expect(task.short_description).toBe("first line");
	});

	it("includes the full description when asked", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				description: "first line\nsecond line",
			}),
		);

		const [task] = listTasks(db, { title: "alpha", include_description: true });

		expect(task.description).toBe("first line\nsecond line");
		expect(task.short_description).toBeUndefined();
	});

	it("keeps the full description when fields request it", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				description: "line one\nline two",
			}),
		);

		const [task] = listTasks(db, { title: "alpha", fields: "id,description" });

		expect(task.description).toBe("line one\nline two");
	});

	it("truncates a long short_description and handles an empty one", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Long",
				description: "x".repeat(200),
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Empty" }));

		const [longTask] = listTasks(db, { title: "Long" });
		const [emptyTask] = listTasks(db, { title: "Empty" });

		expect(longTask.short_description).toHaveLength(
			SHORT_DESCRIPTION_LENGTH + 1,
		);
		expect(longTask.short_description?.endsWith("…")).toBe(true);
		expect(emptyTask.short_description).toBe("");
	});

	it("sorts by priority severity, most severe first", async () => {
		const db = await setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "Low", priority: "low" }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Critical",
				priority: "critical",
			}),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "High", priority: "high" }),
		);

		expect(listTasks(db, { sort: "priority" }).map((t) => t.priority)).toEqual([
			"critical",
			"high",
			"low",
		]);
	});

	it("counts tasks by status", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "A", status: "open" }));
		const b = unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "B",
				priority: "high",
			}),
		);
		unwrap(updateTask(db, b.id, { status: "blocked" }));
		unwrap(createTask(db, { project_id: "spa", title: "C" }));

		expect(countTasksByStatus(db, "spa")).toEqual(
			statusCounts({ backlog: 1, open: 1, blocked: 1 }),
		);
	});

	it("counts tasks and epics by status separately", async () => {
		const db = await setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "Task", status: "open" }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Epic",
				status: "open",
				is_epic: true,
			}),
		);
		const done = unwrap(
			createTask(db, { project_id: "spa", title: "Done", is_epic: true }),
		);
		unwrap(updateTask(db, done.id, { status: "done" }));

		expect(countTasksByStatus(db, "spa")).toEqual(statusCounts({ open: 1 }));
		expect(countEpicsByStatus(db, "spa")).toEqual(
			statusCounts({ open: 1, done: 1 }),
		);
	});
});

describe("task moves", () => {
	it("assigns the next number in the target project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "bil", title: "Existing" }));
		const task = unwrap(createTask(db, { project_id: "spa", title: "Move" }));

		const moved = unwrap(moveTask(db, task.id, "bil"));

		expect(moved.id).toBe("BIL-2");
		expect(moved.project_id).toBe("bil");
		expect(getTask(db, task.id)).toBeUndefined();
	});

	it("detaches a child moved to another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);

		const moved = unwrap(moveTask(db, child.id, "bil"));

		expect(moved.id).toBe("BIL-1");
		expect(moved.epic_id).toBeNull();
	});

	it("moves an epic with its tasks and rewires the links", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);
		const leaf = unwrap(createTask(db, { project_id: "spa", title: "Leaf" }));

		const moved = unwrap(moveTask(db, epic.id, "bil"));

		expect(moved.id).toBe("BIL-1");
		expect(getTask(db, "BIL-1")?.id).toBe("BIL-1");
		expect(getTask(db, "BIL-2")?.epic_id).toBe("BIL-1");
		expect(getTask(db, child.id)).toBeUndefined();
		expect(getTask(db, leaf.id)?.id).toBe(leaf.id);
	});

	it("returns the task unchanged when the project matches", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Stay" }));

		const moved = unwrap(moveTask(db, task.id, "spa"));

		expect(moved.id).toBe(task.id);
		expect(moved.updated_at).toBe(task.updated_at);
	});

	it("returns not_found for an unknown task or project", async () => {
		const db = await setup();

		expect(failure(moveTask(db, "SPA-9", "spa")).kind).toBe("not_found");
		const task = unwrap(createTask(db, { project_id: "spa", title: "X" }));
		expect(failure(moveTask(db, task.id, "ghost")).kind).toBe("not_found");
	});
});

describe("task numbering", () => {
	it("does not reuse the number of a deleted task", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(deleteTask(db, first.id));

		const next = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		expect(next.id).toBe("SPA-2");
	});

	it("does not reuse the number of a task moved away", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(moveTask(db, first.id, "bil"));

		const next = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		expect(next.id).toBe("SPA-2");
	});

	it("does not reuse a number in the project a task moved out of", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const moved = unwrap(createTask(db, { project_id: "bil", title: "A" }));
		unwrap(moveTask(db, moved.id, "spa"));

		const next = unwrap(createTask(db, { project_id: "bil", title: "B" }));

		expect(next.id).toBe("BIL-2");
	});
});

describe("task links", () => {
	it("stores relates_to once and reads it from both tasks", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		unwrap(addLink(db, "relates_to", first.id, second.id));

		expect(getTask(db, first.id)?.relates_to).toEqual([second.id]);
		expect(getTask(db, second.id)?.relates_to).toEqual([first.id]);
	});

	it("is idempotent for a symmetric relates_to link", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "relates_to", first.id, second.id));

		unwrap(addLink(db, "relates_to", second.id, first.id));

		expect(getTask(db, first.id)?.relates_to).toEqual([second.id]);
	});

	it("reads duplicates only in the stored direction", async () => {
		const db = await setup();
		const duplicate = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const original = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		unwrap(addLink(db, "duplicates", duplicate.id, original.id));

		expect(getTask(db, duplicate.id)?.duplicates).toEqual([original.id]);
		expect(getTask(db, duplicate.id)?.duplicated_by).toEqual([]);
		expect(getTask(db, original.id)?.duplicates).toEqual([]);
		expect(getTask(db, original.id)?.duplicated_by).toEqual([duplicate.id]);
	});

	it("rejects a self link and a duplicates cycle", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "duplicates", first.id, second.id));

		expect(failure(addLink(db, "relates_to", first.id, first.id)).kind).toBe(
			"validation",
		);
		const error = failure(addLink(db, "duplicates", second.id, first.id));
		expect(error.kind).toBe("conflict");
		expect(error.message).toContain("cycle");
	});

	it("removes a link and reports a missing one", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "relates_to", first.id, second.id));

		unwrap(removeLink(db, "relates_to", first.id, second.id));

		expect(getTask(db, first.id)?.relates_to).toEqual([]);
		expect(
			failure(removeLink(db, "relates_to", first.id, second.id)).kind,
		).toBe("not_found");
	});
});

describe("task moves with links", () => {
	it("remaps links inside the moved subtree", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const first = unwrap(
			createTask(db, { project_id: "spa", title: "A", epic_id: epic.id }),
		);
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "B", epic_id: epic.id }),
		);
		unwrap(addLink(db, "blocks", second.id, first.id));

		const moved = unwrap(moveTask(db, epic.id, "bil"));

		expect(moved.id).toBe("BIL-1");
		expect(getTask(db, "BIL-2")?.blocked_by).toEqual(["BIL-3"]);
		expect(getTask(db, "BIL-3")?.blocks).toEqual(["BIL-2"]);
	});

	it("keeps a link to a task outside the subtree", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const moved = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const external = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "relates_to", moved.id, external.id));

		const movedTask = unwrap(moveTask(db, moved.id, "bil"));

		expect(getTask(db, movedTask.id)?.relates_to).toEqual([external.id]);
		expect(getTask(db, external.id)?.relates_to).toEqual([movedTask.id]);
	});
});

describe("epic guards", () => {
	it("rejects an epic with an epic", async () => {
		const db = await setup();
		const parent = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);

		const error = failure(
			createTask(db, {
				project_id: "spa",
				title: "Nested",
				is_epic: true,
				epic_id: parent.id,
			}),
		);

		expect(error.kind).toBe("validation");
		expect(error.message).toContain("epics are flat");
		expect(listTasks(db, { is_epic: true })).toHaveLength(1);
	});

	it("rejects promoting a task that belongs to an epic", async () => {
		const db = await setup();
		const first = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Other", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: first.id }),
		);

		const promote = failure(updateTask(db, child.id, { is_epic: true }));
		const attach = failure(updateTask(db, second.id, { epic_id: first.id }));

		expect(promote.kind).toBe("validation");
		expect(promote.message).toContain("epics are flat");
		expect(attach.kind).toBe("validation");
		expect(attach.message).toContain("epics are flat");
		expect(getTask(db, child.id)?.is_epic).toBe(false);
		expect(getTask(db, second.id)?.epic_id).toBeNull();
	});

	it("rejects demoting an epic with subtasks", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: epic.id }),
		);

		const error = failure(updateTask(db, epic.id, { is_epic: false }));

		expect(error.kind).toBe("validation");
		expect(error.message).toContain("cannot demote");
	});

	it("demotes an epic without subtasks", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);

		const demoted = unwrap(updateTask(db, epic.id, { is_epic: false }));

		expect(demoted.is_epic).toBe(false);
	});
});
