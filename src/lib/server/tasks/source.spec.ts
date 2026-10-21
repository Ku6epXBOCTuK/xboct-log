import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AppError } from "../errors";
import { openMigratedDatabase } from "../migrations";
import { createProject } from "../projects";
import { createTask, moveTask, updateTask } from "./index";

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

describe("source location uniqueness", () => {
	it("rejects a second task at the same source location", async () => {
		const db = await setup();
		const first = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "First",
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);

		const error = failure(
			createTask(db, {
				project_id: "spa",
				title: "Second",
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);

		expect(error.kind).toBe("conflict");
		expect(error.message).toContain("src/cart.ts:42");
		expect(error.message).toContain(first.id);
	});

	it("allows tasks without a source line", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "First",
				source_file: "src/cart.ts",
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Second",
				source_file: "src/cart.ts",
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Third" }));
		unwrap(createTask(db, { project_id: "spa", title: "Fourth" }));
	});

	it("allows the same source location in another project", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "First",
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "bil",
				title: "Second",
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);
	});

	it("rejects an update that points at a taken location", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "First",
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);
		const other = unwrap(
			createTask(db, { project_id: "spa", title: "Second" }),
		);

		const error = failure(
			updateTask(db, other.id, { source_file: "src/cart.ts", source_line: 42 }),
		);

		expect(error.kind).toBe("conflict");
	});

	it("rejects a move that lands on a taken location", async () => {
		const db = await setup();
		const moving = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "First",
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "bil",
				title: "Second",
				source_file: "src/cart.ts",
				source_line: 42,
			}),
		);

		const error = failure(moveTask(db, moving.id, "bil"));

		expect(error.kind).toBe("conflict");
	});
});
