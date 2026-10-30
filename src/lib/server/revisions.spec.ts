import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { type AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import { listRevisions, recordRevision, REVISION_MERGE_MS } from "./revisions";
import { createTask, updateTask } from "./tasks";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

async function setup(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	unwrap(
		createTask(db, {
			project_id: "spa",
			title: "Task",
			description: "first",
		}),
	);
	return db;
}

describe("description revisions", () => {
	it("merges the edits made inside the window into one revision", async () => {
		const db = await setup();

		unwrap(updateTask(db, "SPA-1", { description: "second" }));
		unwrap(updateTask(db, "SPA-1", { description: "third" }));

		expect(listRevisions(db, "SPA-1").map((item) => item.body)).toEqual([
			"first",
		]);
		expect(
			listRevisions(db, "SPA-1").every((item) => item.field === "description"),
		).toBe(true);
		expect(
			listRevisions(db, "SPA-1").every((item) => item.ref_id === null),
		).toBe(true);
	});

	it("starts a new revision once the window has passed", async () => {
		const db = await setup();
		const start = new Date("2026-01-01T10:00:00.000Z");
		const at = (offset: number) => new Date(start.getTime() + offset);

		recordRevision(
			db,
			{ task_id: "SPA-1", field: "description", body: "first" },
			start,
		);
		recordRevision(
			db,
			{ task_id: "SPA-1", field: "description", body: "second" },
			at(REVISION_MERGE_MS - 1000),
		);
		recordRevision(
			db,
			{ task_id: "SPA-1", field: "description", body: "third" },
			at(REVISION_MERGE_MS + 1000),
		);

		expect(listRevisions(db, "SPA-1").map((item) => item.body)).toEqual([
			"first",
			"third",
		]);
	});

	it("writes no revision when the description does not change", async () => {
		const db = await setup();

		unwrap(updateTask(db, "SPA-1", { description: "first" }));
		unwrap(updateTask(db, "SPA-1", { title: "Renamed" }));
		unwrap(updateTask(db, "SPA-1", { status: "done" }));

		expect(listRevisions(db, "SPA-1")).toHaveLength(0);
	});

	it("keeps the old text when the description is cleared", async () => {
		const db = await setup();

		unwrap(updateTask(db, "SPA-1", { description: "" }));

		expect(listRevisions(db, "SPA-1").map((item) => item.body)).toEqual([
			"first",
		]);
		expect(
			unwrap(updateTask(db, "SPA-1", { description: "" })).description,
		).toBe("");
	});

	it("keeps the revisions of a task that moved to another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(updateTask(db, "SPA-1", { description: "second" }));

		const { moveTask } = await import("./tasks");
		const moved = unwrap(moveTask(db, "SPA-1", "bil"));

		expect(listRevisions(db, moved.id).map((item) => item.body)).toEqual([
			"first",
		]);
	});
});
