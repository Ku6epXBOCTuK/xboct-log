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
	moveTask,
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
});
