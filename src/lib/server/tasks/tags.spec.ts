import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AppError } from "../errors";
import { openMigratedDatabase } from "../migrations";
import { createProject } from "../projects";
import { createTask, deleteTask, listTags } from "./index";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

async function setup(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
	return db;
}

describe("listTags", () => {
	it("counts the tasks per tag, most used first", async () => {
		const db = await setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "One", tags: ["mcp", "ui"] }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Two", tags: ["mcp"] }));
		unwrap(createTask(db, { project_id: "spa", title: "Three" }));

		expect(listTags(db)).toEqual([
			{ tag: "mcp", count: 2, active: 2 },
			{ tag: "ui", count: 1, active: 1 },
		]);
	});

	it("filters by project", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "One", tags: ["mcp"] }));
		unwrap(createTask(db, { project_id: "bil", title: "Two", tags: ["ui"] }));

		expect(listTags(db, { project_id: "bil" })).toEqual([
			{ tag: "ui", count: 1, active: 1 },
		]);
		expect(listTags(db, { project_id: ["spa", "bil"] })).toEqual([
			{ tag: "mcp", count: 1, active: 1 },
			{ tag: "ui", count: 1, active: 1 },
		]);
	});

	it("filters by status", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "One",
				tags: ["mcp"],
				status: "done",
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Two", tags: ["mcp"] }));

		expect(listTags(db, { status: ["done"] })).toEqual([
			{ tag: "mcp", count: 1, active: 0 },
		]);
		expect(listTags(db, { status: ["open"] })).toEqual([
			{ tag: "mcp", count: 1, active: 1 },
		]);
	});

	it("ignores soft-deleted tasks", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "One", tags: ["mcp"] }),
		);
		unwrap(deleteTask(db, task.id));

		expect(listTags(db)).toEqual([]);
	});
});
