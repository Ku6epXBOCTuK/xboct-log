import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AppError } from "../errors";
import { openMigratedDatabase } from "../migrations";
import { createProject } from "../projects";
import { boardTasks, createTask } from "./index";

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

describe("boardTasks", () => {
	it("keeps every status as a column", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "One" }));

		const board = boardTasks(db);

		expect(board.columns.map((column) => column.status)).toEqual([
			"open",
			"in-progress",
			"blocked",
			"done",
			"cancelled",
		]);
		expect(board.total).toBe(1);
		expect(board.columns[0].items.map((task) => task.title)).toEqual(["One"]);
		expect(board.columns[1].count).toBe(0);
	});

	it("groups the tasks by status", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "One",
				status: "in-progress",
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Two",
				status: "in-progress",
			}),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "Three", status: "done" }),
		);

		const board = boardTasks(db, { project_id: "spa", sort: "number" });

		const column = board.columns.find(
			(entry) => entry.status === "in-progress",
		);
		expect(column?.count).toBe(2);
		expect(column?.items.map((task) => task.title)).toEqual(["One", "Two"]);
		expect(board.total).toBe(3);
	});

	it("keeps only the requested status columns", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "One" }));
		unwrap(createTask(db, { project_id: "spa", title: "Two", status: "done" }));

		const board = boardTasks(db, { status: ["done"] });

		expect(board.columns.map((column) => column.status)).toEqual(["done"]);
		expect(board.total).toBe(1);
	});

	it("counts every matching task but cuts the items by the limit", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "One" }));
		unwrap(createTask(db, { project_id: "spa", title: "Two" }));
		unwrap(createTask(db, { project_id: "spa", title: "Three" }));

		const board = boardTasks(db, { limit: 1 });

		const column = board.columns[0];
		expect(column.count).toBe(3);
		expect(column.items).toHaveLength(1);
		expect(board.total).toBe(3);
	});

	it("filters by project", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "One" }));
		unwrap(createTask(db, { project_id: "bil", title: "Two" }));

		const board = boardTasks(db, { project_id: "bil" });

		expect(board.total).toBe(1);
		expect(board.columns[0].items.map((task) => task.title)).toEqual(["Two"]);
	});
});
