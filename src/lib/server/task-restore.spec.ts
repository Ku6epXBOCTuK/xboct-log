import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import { createTask, deleteTask, listTasks, restoreTask } from "./tasks";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

describe("task restore", () => {
	let db: DatabaseSync;

	beforeEach(async () => {
		db = await openMigratedDatabase(":memory:");
		unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
	});

	it("brings a soft-deleted task back", () => {
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Shop task" }),
		);
		unwrap(deleteTask(db, task.id));

		expect(listTasks(db, { project_id: "spa" })).toHaveLength(0);

		const restored = unwrap(restoreTask(db, task.id));

		expect(restored.id).toBe(task.id);
		expect(restored.deleted_at).toBeNull();
		expect(listTasks(db, { project_id: "spa" }).map((item) => item.id)).toEqual(
			[task.id],
		);
	});

	it("restores by a bare task number inside a project", () => {
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Shop task" }),
		);
		unwrap(deleteTask(db, task.id));

		const restored = unwrap(restoreTask(db, String(task.number), "spa"));

		expect(restored.id).toBe(task.id);
		expect(restored.deleted_at).toBeNull();
	});

	it("fails when the task is not deleted", () => {
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Shop task" }),
		);

		const result = restoreTask(db, task.id);

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().status).toBe(409);
	});

	it("fails when the task does not exist", () => {
		const result = restoreTask(db, "SPA-999");

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().status).toBe(404);
	});

	it("fails when a bare number is ambiguous across projects", () => {
		const first = unwrap(
			createTask(db, { project_id: "spa", title: "Shop task" }),
		);
		const second = unwrap(
			createTask(db, { project_id: "bil", title: "Billing task" }),
		);
		unwrap(deleteTask(db, first.id));
		unwrap(deleteTask(db, second.id));

		const result = restoreTask(db, String(first.number));

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().status).toBe(400);
		expect(result._unsafeUnwrapErr().message).toContain("ambiguous");
	});

	it("fails when the task belongs to another project", () => {
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Shop task" }),
		);
		unwrap(deleteTask(db, task.id));

		const result = restoreTask(db, task.id, "bil");

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().status).toBe(400);
	});
});
