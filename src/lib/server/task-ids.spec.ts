import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { type AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import {
	closeTask,
	createTask,
	deleteTask,
	getTask,
	getTasksByIds,
	listTasks,
	moveTask,
	resolveEpicId,
	resolveTaskId,
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

async function setup(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	return db;
}

describe("task id resolution", () => {
	it("resolves the full id and rejects an unknown one", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		expect(unwrap(resolveTaskId(db, task.id))).toBe(task.id);
		expect(failure(resolveTaskId(db, "SPA-99")).kind).toBe("not_found");
	});

	it("resolves a full id regardless of the prefix case", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		expect(unwrap(resolveTaskId(db, "spa-1"))).toBe(task.id);
		expect(unwrap(resolveTaskId(db, "Spa-1"))).toBe(task.id);
	});

	it("resolves an epic id regardless of the prefix case", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Epic", is_epic: true }),
		);

		expect(unwrap(resolveEpicId(db, "spa-1", "spa"))).toBe(epic.id);
	});

	it("rejects a bare number and names the candidate ids", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(createTask(db, { project_id: "bil", title: "B" }));

		const error = failure(resolveTaskId(db, "1"));
		expect(error.kind).toBe("validation");
		expect(error.message).toContain("SPA-1");
		expect(error.message).toContain("BIL-1");
		expect(getTask(db, "1")).toBeUndefined();
	});

	it("rejects a bare number that matches nothing", async () => {
		const db = await setup();

		const error = failure(resolveTaskId(db, "42"));
		expect(error.kind).toBe("validation");
		expect(error.message).toContain("PREFIX-NUMBER");
	});

	it("does not resolve a soft-deleted task", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(deleteTask(db, task.id));

		expect(failure(resolveTaskId(db, task.id)).kind).toBe("not_found");
	});

	it("updates and closes a task by its full id", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		expect(unwrap(updateTask(db, task.id, { title: "Renamed" })).title).toBe(
			"Renamed",
		);
		const closed = unwrap(closeTask(db, task.id, "fixed"));
		expect(closed.id).toBe(task.id);
		expect(closed.status).toBe("done");
	});

	it("moves and deletes a task by its full id", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const moved = unwrap(moveTask(db, task.id, "bil"));
		expect(moved.id).toBe("BIL-1");
		expect(unwrap(deleteTask(db, "BIL-1"))).toBe("BIL-1");
	});

	it("fetches a mix of full ids and unknown ones", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		const result = getTasksByIds(db, [second.id, first.id, "SPA-404"]);
		expect(result.items.map((task) => task.id)).toEqual([second.id, first.id]);
		expect(result.missing).toEqual(["SPA-404"]);
	});

	it("creates and updates a task with a full epic id", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Epic", is_epic: true }),
		);
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const child = unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: epic.id }),
		);
		expect(child.epic_id).toBe(epic.id);

		const updated = unwrap(updateTask(db, task.id, { epic_id: epic.id }));
		expect(updated.epic_id).toBe(epic.id);
	});

	it("rejects a bare epic number and names the epic id", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Epic", is_epic: true }));

		const error = failure(
			createTask(db, { project_id: "spa", title: "Child", epic_id: "1" }),
		);
		expect(error.kind).toBe("validation");
		expect(error.message).toContain("SPA-1");
	});

	it("rejects a full epic id that belongs to another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Epic", is_epic: true }),
		);

		const error = failure(
			createTask(db, { project_id: "bil", title: "Child", epic_id: epic.id }),
		);
		expect(error.kind).toBe("validation");
		expect(error.message).toContain("same project");
	});

	it("suggests a close id when the task is not found", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const error = failure(resolveTaskId(db, "SPA-3"));
		expect(error.kind).toBe("not_found");
		expect(error.message).toContain("did you mean");
		expect(error.message).toContain("SPA-1");
	});

	it("reports an unknown project prefix in the id", async () => {
		const db = await setup();

		const error = failure(resolveTaskId(db, "XXX-1"));
		expect(error.kind).toBe("not_found");
		expect(error.message).toContain("unknown project prefix");
	});

	it("filters tasks by a full epic id", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const spaEpic = unwrap(
			createTask(db, { project_id: "spa", title: "Epic", is_epic: true }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: spaEpic.id,
			}),
		);
		const bilEpic = unwrap(
			createTask(db, { project_id: "bil", title: "Other", is_epic: true }),
		);
		unwrap(
			createTask(db, { project_id: "bil", title: "Leaf", epic_id: bilEpic.id }),
		);

		expect(
			listTasks(db, { epic_id: spaEpic.id })
				.map((task) => task.id)
				.sort(),
		).toEqual(["SPA-2"]);
		expect(
			listTasks(db, { epic_id: [spaEpic.id, bilEpic.id] })
				.map((task) => task.id)
				.sort(),
		).toEqual(["BIL-2", "SPA-2"]);
	});
});
