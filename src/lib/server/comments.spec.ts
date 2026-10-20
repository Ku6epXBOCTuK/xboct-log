import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
	addComment,
	deleteComment,
	editComment,
	getComment,
	listComments,
} from "./comments";
import { type AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import { listRevisions } from "./revisions";
import { createTask } from "./tasks";

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
	unwrap(createTask(db, { project_id: "spa", title: "Task" }));
	return db;
}

describe("comments", () => {
	it("adds a comment and trims the body", async () => {
		const db = await setup();

		const comment = unwrap(
			addComment(db, { task_id: "SPA-1", body: "  first note  " }),
		);

		expect(comment.task_id).toBe("SPA-1");
		expect(comment.body).toBe("first note");
		expect(comment.edited_at).toBeNull();
		expect(comment.deleted_at).toBeNull();
		expect(listComments(db, "SPA-1")).toHaveLength(1);
	});

	it("rejects an empty body and an unknown task", async () => {
		const db = await setup();

		expect(
			failure(addComment(db, { task_id: "SPA-1", body: "   " })).kind,
		).toBe("validation");
		expect(
			failure(addComment(db, { task_id: "SPA-999", body: "x" })).kind,
		).toBe("not_found");
	});

	it("keeps the previous text as a revision when a comment is edited", async () => {
		const db = await setup();
		const comment = unwrap(addComment(db, { task_id: "SPA-1", body: "first" }));

		const edited = unwrap(editComment(db, comment.id, "second"));

		expect(edited.body).toBe("second");
		expect(edited.edited_at).not.toBeNull();
		const revisions = listRevisions(db, "SPA-1");
		expect(revisions).toHaveLength(1);
		expect(revisions[0].field).toBe("comment");
		expect(revisions[0].ref_id).toBe(comment.id);
		expect(revisions[0].body).toBe("first");
	});

	it("writes no revision when the text stays the same", async () => {
		const db = await setup();
		const comment = unwrap(addComment(db, { task_id: "SPA-1", body: "same" }));

		unwrap(editComment(db, comment.id, "same"));

		expect(listRevisions(db, "SPA-1")).toHaveLength(0);
	});

	it("soft-deletes a comment and hides it from the list", async () => {
		const db = await setup();
		const comment = unwrap(addComment(db, { task_id: "SPA-1", body: "bye" }));

		const deleted = unwrap(deleteComment(db, comment.id));

		expect(deleted.deleted_at).not.toBeNull();
		expect(listComments(db, "SPA-1")).toHaveLength(0);
		expect(getComment(db, comment.id)?.deleted_at).not.toBeNull();
		expect(failure(deleteComment(db, comment.id)).kind).toBe("not_found");
		expect(failure(editComment(db, comment.id, "z")).kind).toBe("not_found");
	});

	it("gives the comments time-sortable ids", async () => {
		const db = await setup();

		const first = unwrap(addComment(db, { task_id: "SPA-1", body: "one" }));
		const second = unwrap(addComment(db, { task_id: "SPA-1", body: "two" }));

		expect(second.id > first.id).toBe(true);
	});

	it("lists the comments of a task oldest first", async () => {
		const db = await setup();

		unwrap(addComment(db, { task_id: "SPA-1", body: "one" }));
		unwrap(addComment(db, { task_id: "SPA-1", body: "two" }));

		expect(listComments(db, "SPA-1").map((item) => item.body)).toEqual([
			"one",
			"two",
		]);
	});

	it("follows the task when it moves to another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(addComment(db, { task_id: "SPA-1", body: "kept" }));

		const { moveTask } = await import("./tasks");
		const moved = unwrap(moveTask(db, "SPA-1", "bil"));

		expect(listComments(db, moved.id).map((item) => item.body)).toEqual([
			"kept",
		]);
		expect(listComments(db, "SPA-1")).toHaveLength(0);
	});
});
