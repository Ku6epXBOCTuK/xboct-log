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

	it("resolves a bare number when it is unique", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		expect(unwrap(resolveTaskId(db, "1"))).toBe(task.id);
		expect(getTask(db, "1")?.id).toBe(task.id);
	});

	it("reports ambiguous numbers with the candidate ids", async () => {
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

	it("does not resolve soft-deleted tasks by number", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(deleteTask(db, task.id));

		expect(failure(resolveTaskId(db, "1")).kind).toBe("not_found");
	});

	it("updates and closes a task given a bare number", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		expect(unwrap(updateTask(db, "1", { title: "Renamed" })).title).toBe(
			"Renamed",
		);
		const closed = unwrap(closeTask(db, "1", "fixed"));
		expect(closed.id).toBe(task.id);
		expect(closed.status).toBe("done");
	});

	it("moves and deletes a task given a bare number", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const moved = unwrap(moveTask(db, "1", "bil"));
		expect(moved.id).toBe("BIL-1");
		expect(unwrap(deleteTask(db, "1"))).toBe("BIL-1");
	});

	it("fetches a mix of full ids and numbers", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		const result = getTasksByIds(db, [second.id, "1", "404"]);
		expect(result.items.map((task) => task.id)).toEqual([second.id, first.id]);
		expect(result.missing).toEqual(["404"]);
	});

	it("resolves a bare number inside the given project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const spaTask = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const bilTask = unwrap(createTask(db, { project_id: "bil", title: "B" }));

		expect(unwrap(resolveTaskId(db, "1", "spa"))).toBe(spaTask.id);
		expect(unwrap(resolveTaskId(db, "1", "bil"))).toBe(bilTask.id);
		expect(failure(resolveTaskId(db, "1")).kind).toBe("validation");
	});

	it("reports a number missing in the given project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const error = failure(resolveTaskId(db, "1", "bil"));
		expect(error.kind).toBe("not_found");
		expect(error.message).toContain("bil");
	});

	it("rejects a full id that belongs to another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const spaTask = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const error = failure(resolveTaskId(db, spaTask.id, "bil"));
		expect(error.kind).toBe("validation");
		expect(error.message).toContain("spa");
	});

	it("updates, closes, moves and deletes by number inside a project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(createTask(db, { project_id: "bil", title: "B" }));

		expect(unwrap(updateTask(db, "1", { title: "Renamed" }, "bil")).title).toBe(
			"Renamed",
		);
		expect(unwrap(closeTask(db, "1", "fixed", "bil")).id).toBe("BIL-1");
		expect(unwrap(moveTask(db, "1", "spa", "bil")).id).toBe("SPA-2");
		expect(unwrap(deleteTask(db, "2", "spa"))).toBe("SPA-2");
	});

	it("resolves numbers inside a project for batch lookups", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const bilTask = unwrap(createTask(db, { project_id: "bil", title: "B" }));

		const result = getTasksByIds(db, ["1"], "bil");
		expect(result.items.map((task) => task.id)).toEqual([bilTask.id]);
		expect(result.missing).toEqual([]);

		const ambiguous = getTasksByIds(db, ["1"]);
		expect(ambiguous.items).toEqual([]);
		expect(ambiguous.missing).toEqual(["1"]);
	});

	it("creates and updates a task with an epic given as a number", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Epic", is_epic: true }),
		);
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		const child = unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: "1" }),
		);
		expect(child.epic_id).toBe(epic.id);

		const updated = unwrap(updateTask(db, task.id, { epic_id: "1" }));
		expect(updated.epic_id).toBe(epic.id);
	});

	it("rejects an epic number missing in the project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "spa", title: "Epic", is_epic: true }));

		const error = failure(
			createTask(db, { project_id: "bil", title: "Child", epic_id: "1" }),
		);
		expect(error.kind).toBe("not_found");
		expect(error.message).toContain("bil");
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

	it("filters tasks by epic number", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "spa", title: "Epic", is_epic: true }));
		unwrap(createTask(db, { project_id: "spa", title: "Child", epic_id: "1" }));
		unwrap(
			createTask(db, { project_id: "bil", title: "Other", is_epic: true }),
		);
		unwrap(createTask(db, { project_id: "bil", title: "Leaf", epic_id: "1" }));

		expect(
			listTasks(db, { epic_id: "1" })
				.map((task) => task.id)
				.sort(),
		).toEqual(["BIL-2", "SPA-2"]);
		expect(
			listTasks(db, { epic_id: "1", project_id: "spa" }).map((task) => task.id),
		).toEqual(["SPA-2"]);
	});
});
