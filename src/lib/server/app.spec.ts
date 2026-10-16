import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { type AppError } from "./errors";
import {
	createProject,
	getProject,
	listProjects,
	updateProject,
} from "./projects";
import {
	closeTask,
	countTasksByStatus,
	createTask,
	deleteTask,
	getTask,
	listTasks,
	updateTask,
} from "./tasks";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

function failure(result: Result<unknown, AppError>): AppError {
	expect(result.isErr()).toBe(true);
	return result._unsafeUnwrapErr();
}

function setup(): DatabaseSync {
	const db = openDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	return db;
}

describe("projects", () => {
	it("creates a project and reads it back", () => {
		const db = openDatabase(":memory:");
		const project = unwrap(
			createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }),
		);

		expect(project).toMatchObject({ id: "spa", name: "Shop", prefix: "SPA" });
		expect(project.archived_at).toBeNull();
		expect(getProject(db, "spa")).toEqual(project);
	});

	it("returns a conflict for a duplicate prefix", () => {
		const db = setup();
		const error = failure(
			createProject(db, { id: "other", name: "Other", prefix: "SPA" }),
		);

		expect(error.kind).toBe("conflict");
		expect(error.status).toBe(409);
	});

	it("returns a validation error for an invalid id", () => {
		const db = openDatabase(":memory:");
		const error = failure(
			createProject(db, { id: "bad id!", name: "Bad", prefix: "BAD" }),
		);

		expect(error.kind).toBe("validation");
		expect(error.message).toContain("latin letters");
	});

	it("returns not_found when updating a missing project", () => {
		const db = openDatabase(":memory:");
		const error = failure(updateProject(db, "ghost", { name: "Ghost" }));

		expect(error.kind).toBe("not_found");
	});

	it("archives a project and hides it from the default list", () => {
		const db = setup();
		unwrap(updateProject(db, "spa", { archived: true }));

		expect(listProjects(db)).toHaveLength(0);
		expect(listProjects(db, { includeArchived: true })).toHaveLength(1);
	});

	it("renames and restores a project", () => {
		const db = setup();
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
	it("generates sequential ids per project", () => {
		const db = setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "First" }));
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Second" }),
		);

		expect(first.id).toBe("SPA-1");
		expect(second.id).toBe("SPA-2");
		expect(first.number).toBe(1);
	});

	it("applies defaults and round-trips arrays and source", () => {
		const db = setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Fix checkout",
				tags: ["perf", "perf", " checkout "],
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);

		expect(task.status).toBe("open");
		expect(task.priority).toBe("medium");
		expect(task.tags).toEqual(["perf", "checkout"]);
		expect(task.source_file).toBe("src/cart.ts");
		expect(task.source_line).toBe(42);
		expect(task.closed_at).toBeNull();
		expect(getTask(db, task.id)).toEqual(task);
	});

	it("returns not_found for an unknown project", () => {
		const db = openDatabase(":memory:");
		const error = failure(createTask(db, { project_id: "ghost", title: "X" }));

		expect(error.kind).toBe("not_found");
	});

	it("returns a validation error when source_line has no source_file", () => {
		const db = setup();
		const error = failure(
			createTask(db, { project_id: "spa", title: "X", source_line: 3 }),
		);

		expect(error.kind).toBe("validation");
		expect(error.message).toBe("source_line requires source_file");
	});

	it("stamps closed_at on close and clears it on reopen", () => {
		const db = setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		const closed = unwrap(updateTask(db, task.id, { status: "done" }));
		expect(closed.closed_at).not.toBeNull();

		const reopened = unwrap(updateTask(db, task.id, { status: "open" }));
		expect(reopened.closed_at).toBeNull();
	});

	it("closes with a reason and clears it on reopen", () => {
		const db = setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		const closed = unwrap(closeTask(db, task.id, "obsolete"));
		expect(closed.status).toBe("cancelled");
		expect(closed.closed_reason).toBe("obsolete");
		expect(closed.closed_at).not.toBeNull();

		const reopened = unwrap(updateTask(db, task.id, { status: "open" }));
		expect(reopened.closed_at).toBeNull();
		expect(reopened.closed_reason).toBeNull();
	});

	it("maps the fixed reason to done", () => {
		const db = setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Ship" }));

		expect(unwrap(closeTask(db, task.id, "fixed")).status).toBe("done");
	});

	it("returns not_found when closing a missing task", () => {
		const db = setup();

		expect(failure(closeTask(db, "SPA-9", "fixed")).kind).toBe("not_found");
	});

	it("deletes a task and detaches its epic children", () => {
		const db = setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: epic.id }),
		);

		expect(unwrap(deleteTask(db, epic.id))).toBe(epic.id);
		expect(getTask(db, epic.id)).toBeUndefined();
		expect(getTask(db, child.id)?.epic_id).toBeNull();
		expect(failure(deleteTask(db, epic.id)).kind).toBe("not_found");
	});

	it("rejects an epic from another project", () => {
		const db = setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "bil", title: "Big", is_epic: true }),
		);
		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: epic.id }),
		);

		expect(error.message).toBe("epic must belong to the same project");
	});

	it("rejects a non-epic as epic parent", () => {
		const db = setup();
		const plain = unwrap(createTask(db, { project_id: "spa", title: "Plain" }));
		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: plain.id }),
		);

		expect(error.message).toContain("is not an epic");
	});

	it("rejects a task as its own epic", () => {
		const db = setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Loop" }));
		const error = failure(
			updateTask(db, task.id, { is_epic: true, epic_id: task.id }),
		);

		expect(error.message).toBe("a task cannot be its own epic");
	});

	it("filters by status, tag and text", () => {
		const db = setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "Alpha bug", tags: ["perf"] }),
		);
		const beta = unwrap(
			createTask(db, { project_id: "spa", title: "Beta", tags: ["a11y"] }),
		);
		unwrap(updateTask(db, beta.id, { status: "done" }));

		expect(listTasks(db, { status: ["open"] })).toHaveLength(1);
		expect(listTasks(db, { tag: ["a11y"] })).toHaveLength(1);
		expect(listTasks(db, { q: "alpha" })).toHaveLength(1);
		expect(listTasks(db, { project_id: "spa" })).toHaveLength(2);
	});

	it("filters epics and their children", () => {
		const db = setup();
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

	it("sorts by priority severity, most severe first", () => {
		const db = setup();
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

	it("counts tasks by status", () => {
		const db = setup();
		unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const b = unwrap(
			createTask(db, { project_id: "spa", title: "B", priority: "high" }),
		);
		unwrap(updateTask(db, b.id, { status: "blocked" }));

		expect(countTasksByStatus(db, "spa")).toEqual({
			open: 1,
			"in-progress": 0,
			blocked: 1,
			done: 0,
			cancelled: 0,
		});
	});
});
