import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openMigratedDatabase } from "./migrations";
import { type AppError } from "./errors";
import { createProject } from "./projects";
import {
	countTasksByScope,
	createScope,
	deleteScope,
	listScopes,
	scopedProjectIds,
	updateScope,
} from "./scopes";
import { createTask, getTask, listTasks, moveTask, updateTask } from "./tasks";

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

describe("scopes", () => {
	it("creates a scope and lists scopes alphabetically", async () => {
		const db = await setup();
		unwrap(createScope(db, { project_id: "spa", name: "infra" }));
		unwrap(createScope(db, { project_id: "spa", name: "backend" }));

		expect(listScopes(db, "spa").map((scope) => scope.name)).toEqual([
			"backend",
			"infra",
		]);
	});

	it("trims the name and rejects an empty one", async () => {
		const db = await setup();

		expect(
			unwrap(createScope(db, { project_id: "spa", name: "  frontend  " })).name,
		).toBe("frontend");
		expect(
			failure(createScope(db, { project_id: "spa", name: "   " })).kind,
		).toBe("validation");
	});

	it("returns a conflict for a duplicate name in the same project", async () => {
		const db = await setup();
		unwrap(createScope(db, { project_id: "spa", name: "frontend" }));

		const error = failure(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		expect(error.kind).toBe("conflict");
		expect(error.status).toBe(409);
	});

	it("returns not_found for an unknown project", async () => {
		const db = await setup();

		expect(
			failure(createScope(db, { project_id: "ghost", name: "frontend" })).kind,
		).toBe("not_found");
	});

	it("renames a scope and keeps names unique per project", async () => {
		const db = await setup();
		const backend = unwrap(
			createScope(db, { project_id: "spa", name: "backend" }),
		);
		unwrap(createScope(db, { project_id: "spa", name: "infra" }));

		expect(unwrap(updateScope(db, backend.id, { name: " api " })).name).toBe(
			"api",
		);
		expect(failure(updateScope(db, backend.id, { name: "infra" })).kind).toBe(
			"conflict",
		);
		expect(failure(updateScope(db, 999, { name: "x" })).kind).toBe("not_found");
	});

	it("deletes a scope and leaves its tasks unassigned", async () => {
		const db = await setup();
		const scope = unwrap(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Fix",
				scope_id: scope.id,
			}),
		);

		expect(unwrap(deleteScope(db, scope.id))).toBe(scope.id);
		expect(listScopes(db, "spa")).toHaveLength(0);
		expect(getTask(db, task.id)?.scope_id).toBeNull();
		expect(failure(deleteScope(db, scope.id)).kind).toBe("not_found");
	});

	it("reports projects that have scopes", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createScope(db, { project_id: "spa", name: "frontend" }));

		expect(scopedProjectIds(db)).toEqual(["spa"]);
	});

	it("counts tasks by scope, ignoring unassigned ones", async () => {
		const db = await setup();
		const frontend = unwrap(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		const backend = unwrap(
			createScope(db, { project_id: "spa", name: "backend" }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "A", scope_id: frontend.id }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "B", scope_id: frontend.id }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "C", scope_id: backend.id }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Loose" }));

		expect(countTasksByScope(db, "spa")).toEqual({
			[frontend.id]: 2,
			[backend.id]: 1,
		});
	});
});

describe("task scopes", () => {
	it("assigns a scope on create and update", async () => {
		const db = await setup();
		const scope = unwrap(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "A", scope_id: scope.id }),
		);

		expect(task.scope_id).toBe(scope.id);
		expect(
			unwrap(updateTask(db, task.id, { scope_id: null })).scope_id,
		).toBeNull();
	});

	it("rejects a scope from another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const scope = unwrap(
			createScope(db, { project_id: "bil", name: "frontend" }),
		);

		const error = failure(
			createTask(db, { project_id: "spa", title: "A", scope_id: scope.id }),
		);
		expect(error.message).toBe("scope must belong to the same project");
	});

	it("returns not_found for an unknown scope", async () => {
		const db = await setup();

		expect(
			failure(createTask(db, { project_id: "spa", title: "A", scope_id: 999 }))
				.kind,
		).toBe("not_found");
	});

	it("filters by scope, including the unassigned option", async () => {
		const db = await setup();
		const scope = unwrap(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "A", scope_id: scope.id }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Loose" }));

		expect(listTasks(db, { scope_id: scope.id })).toHaveLength(1);
		expect(listTasks(db, { scope_id: null }).map((task) => task.title)).toEqual(
			["Loose"],
		);
	});

	it("resets the scope when moving a task to another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const scope = unwrap(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "A", scope_id: scope.id }),
		);

		expect(unwrap(moveTask(db, task.id, "bil")).scope_id).toBeNull();
	});
});
