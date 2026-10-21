import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { type AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createScope } from "../server/scopes";
import { createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-warnings-"));
	const db = getDb(join(dbDir, "warnings.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "scoped", name: "Scoped", prefix: "SCP" }));
	unwrap(createProject(db, { id: "plain", name: "Plain", prefix: "PLN" }));
	unwrap(createScope(db, { project_id: "scoped", name: "mcp" }));
	unwrap(createScope(db, { project_id: "scoped", name: "ui" }));
});

afterAll(() => {
	closeDb();
	rmSync(dbDir, { recursive: true, force: true });
});

function op(name: string) {
	const found = getOps().get(name);
	if (!found) {
		throw new Error(`unknown op: ${name}`);
	}
	return found;
}

async function call(name: string, input: unknown): Promise<unknown> {
	return runOp(op(name), input, "mcp");
}

interface Created {
	id: string;
	scope_id: number | null;
	warnings: string[];
}

describe("scope warnings", () => {
	it("warns when a task is created without a scope in a project that has scopes", async () => {
		const created = (await call("tasks_create", {
			project_id: "scoped",
			title: "No scope",
		})) as Created;

		expect(created.warnings).toHaveLength(1);
		expect(created.warnings[0]).toContain("no scope set");
		expect(created.warnings[0]).toContain("scoped");
		expect(created.warnings[0]).toContain("mcp");
		expect(created.warnings[0]).toContain("scope_id");
	});

	it("does not warn when the task gets a scope", async () => {
		const scopes = (await call("scopes_list", {
			project_id: "scoped",
		})) as { id: number; name: string }[];
		const scopeId = scopes[0].id;

		const created = (await call("tasks_create", {
			project_id: "scoped",
			title: "With scope",
			scope_id: scopeId,
		})) as Created;

		expect(created.scope_id).toBe(scopeId);
		expect(created.warnings).toEqual([]);
	});

	it("does not warn in a project without scopes", async () => {
		const created = (await call("tasks_create", {
			project_id: "plain",
			title: "No scopes here",
		})) as Created;

		expect(created.warnings).toEqual([]);
	});

	it("warns on update when the scope is cleared", async () => {
		const db = getDb();
		const scope = unwrap(
			createScope(db, { project_id: "scoped", name: "later" }),
		);
		const scoped = unwrap(
			createTask(db, {
				project_id: "scoped",
				title: "Scoped task",
				scope_id: scope.id,
			}),
		);

		const updated = (await call("tasks_update", {
			id: scoped.id,
			patch: { scope_id: null },
		})) as Created;

		expect(updated.scope_id).toBeNull();
		expect(updated.warnings).toHaveLength(1);
		expect(updated.warnings[0]).toContain("no scope set");
	});

	it("reports warnings per item in tasks_create_many", async () => {
		const result = (await call("tasks_create_many", {
			items: [
				{ project_id: "scoped", title: "Batch one" },
				{ project_id: "plain", title: "Batch two" },
			],
		})) as {
			items: { ok: boolean; warnings?: string[] }[];
			succeeded: number;
			failed: number;
		};

		expect(result.succeeded).toBe(2);
		expect(result.items[0].warnings).toHaveLength(1);
		expect(result.items[1].warnings ?? []).toEqual([]);
	});

	it("rejects a scope that belongs to another project", async () => {
		const db = getDb();
		const foreign = unwrap(
			createScope(db, { project_id: "plain", name: "foreign" }),
		);

		await expect(
			call("tasks_create", {
				project_id: "scoped",
				title: "Foreign scope",
				scope_id: foreign.id,
			}),
		).rejects.toThrow();
	});
});
