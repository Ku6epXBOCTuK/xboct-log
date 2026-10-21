import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
	addBlocker,
	listBlockedBy,
	listBlocks,
	removeBlocker,
} from "./blockers";
import { type AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import {
	closeTask,
	createTask,
	deleteTask,
	getTask,
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
	unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
	return db;
}

describe("blockers", () => {
	it("links a blocking task to a blocked task", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		unwrap(addBlocker(db, blocker.id, blocked.id));

		expect(listBlockedBy(db, blocked.id)).toEqual([blocker.id]);
		expect(listBlocks(db, blocker.id)).toEqual([blocked.id]);
		expect(listBlockedBy(db, blocker.id)).toEqual([]);
	});

	it("allows a blocker from another project", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "bil", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		unwrap(addBlocker(db, blocker.id, blocked.id));

		expect(listBlockedBy(db, blocked.id)).toEqual([blocker.id]);
	});

	it("rejects a task blocking itself", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		expect(failure(addBlocker(db, task.id, task.id)).kind).toBe("validation");
	});

	it("rejects a missing task", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));

		expect(failure(addBlocker(db, task.id, "SPA-99")).kind).toBe("not_found");
		expect(failure(addBlocker(db, "SPA-99", task.id)).kind).toBe("not_found");
	});

	it("rejects a direct cycle", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addBlocker(db, first.id, second.id));

		const error = failure(addBlocker(db, second.id, first.id));
		expect(error.kind).toBe("conflict");
		expect(error.message).toContain("cycle");
	});

	it("rejects an indirect cycle", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		const third = unwrap(createTask(db, { project_id: "spa", title: "C" }));
		unwrap(addBlocker(db, first.id, second.id));
		unwrap(addBlocker(db, second.id, third.id));

		expect(failure(addBlocker(db, third.id, first.id)).kind).toBe("conflict");
	});

	it("keeps the link when adding it twice", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(addBlocker(db, blocker.id, blocked.id));

		expect(listBlockedBy(db, blocked.id)).toEqual([blocker.id]);
	});

	it("removes a link and reports a missing one", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(removeBlocker(db, blocker.id, blocked.id));
		expect(listBlockedBy(db, blocked.id)).toEqual([]);
		expect(failure(removeBlocker(db, blocker.id, blocked.id)).kind).toBe(
			"not_found",
		);
	});

	it("drops links of a deleted task", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(deleteTask(db, blocker.id));

		expect(listBlockedBy(db, blocked.id)).toEqual([]);
		expect(listBlocks(db, blocker.id)).toEqual([]);
	});

	it("releases the blocked status when the blocker is closed", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(updateTask(db, blocked.id, { status: "blocked" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(closeTask(db, blocker.id, "fixed"));

		expect(getTask(db, blocked.id)?.status).toBe("open");
	});

	it("keeps the blocked status while another open blocker remains", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "C" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(updateTask(db, blocked.id, { status: "blocked" }));
		unwrap(addBlocker(db, first.id, blocked.id));
		unwrap(addBlocker(db, second.id, blocked.id));

		unwrap(closeTask(db, first.id, "fixed"));
		expect(getTask(db, blocked.id)?.status).toBe("blocked");

		unwrap(closeTask(db, second.id, "fixed"));
		expect(getTask(db, blocked.id)?.status).toBe("open");
	});

	it("releases the blocked status when the blocker is deleted", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(updateTask(db, blocked.id, { status: "blocked" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(deleteTask(db, blocker.id));

		expect(getTask(db, blocked.id)?.status).toBe("open");
	});

	it("returns the task to the status it had before it was blocked", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(updateTask(db, blocked.id, { status: "in-progress" }));
		unwrap(updateTask(db, blocked.id, { status: "blocked" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(closeTask(db, blocker.id, "fixed"));

		expect(getTask(db, blocked.id)?.status).toBe("in-progress");
	});

	it("falls back to open when the previous status is unknown", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(
			createTask(db, { project_id: "spa", title: "B", status: "blocked" }),
		);
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(closeTask(db, blocker.id, "fixed"));

		expect(getTask(db, blocked.id)?.status).toBe("open");
	});

	it("does not restore a closed status", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(closeTask(db, blocked.id, "fixed"));
		unwrap(updateTask(db, blocked.id, { status: "blocked" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(closeTask(db, blocker.id, "fixed"));

		expect(getTask(db, blocked.id)?.status).toBe("open");
	});

	it("keeps the remembered status when the task leaves blocked by hand", async () => {
		const db = await setup();
		const blocker = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const blocked = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(updateTask(db, blocked.id, { status: "in-progress" }));
		unwrap(updateTask(db, blocked.id, { status: "blocked" }));
		unwrap(addBlocker(db, blocker.id, blocked.id));

		unwrap(updateTask(db, blocked.id, { status: "in-progress" }));
		unwrap(updateTask(db, blocked.id, { status: "blocked" }));

		unwrap(closeTask(db, blocker.id, "fixed"));

		expect(getTask(db, blocked.id)?.status).toBe("in-progress");
	});
});
