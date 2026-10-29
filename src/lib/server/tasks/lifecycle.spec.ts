import { describe, expect, it } from "vitest";
import { failure, setup, unwrap } from "../app-test-kit";
import { openMigratedDatabase } from "../migrations";
import { createProject } from "../projects";
import {
	closeTask,
	closeTasksMany,
	createTask,
	createTasksMany,
	deleteTask,
	getTask,
	listTasks,
	updateTask,
	updateTasksMany,
} from "../tasks";

describe("task lifecycle", () => {
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
});

describe("task batches", () => {
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
});
