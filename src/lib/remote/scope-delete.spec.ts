import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActivity } from "../server/activity";
import { closeDb, getDb } from "../server/db";
import { type AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createScope, getScope } from "../server/scopes";
import { createTask, getTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-scope-delete-"));
	const db = getDb(join(dbDir, "scope.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
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

function history(taskId: string) {
	return listActivity(getDb(), { entity: "task", entity_id: taskId }).items;
}

async function fixture(title: string) {
	const db = getDb();
	const scope = unwrap(createScope(db, { project_id: "spa", name: title }));
	const task = unwrap(
		createTask(db, {
			project_id: "spa",
			title: `${title} task`,
			scope_id: scope.id,
		}),
	);
	const epic = unwrap(
		createTask(db, {
			project_id: "spa",
			title: `${title} epic`,
			is_epic: true,
			scope_id: scope.id,
		}),
	);
	return { scope, task, epic };
}

describe("scopes_delete dry run", () => {
	it("previews the affected tasks without deleting anything", async () => {
		const { scope, task, epic } = await fixture("Dry run");

		const preview = (await call("scopes_delete", {
			id: scope.id,
			dry_run: true,
		})) as {
			scope: { id: number; name: string };
			task_ids: string[];
			epic_ids: string[];
		};

		expect(preview.scope.id).toBe(scope.id);
		expect(preview.task_ids).toEqual([task.id]);
		expect(preview.epic_ids).toEqual([epic.id]);
		expect(getScope(getDb(), scope.id)).toBeDefined();
		expect(getTask(getDb(), task.id)?.scope_id).toBe(scope.id);
	});

	it("writes no activity for a dry run", async () => {
		const { scope, task } = await fixture("Dry run log");

		await call("scopes_delete", { id: scope.id, dry_run: true });

		expect(history(task.id)).toEqual([]);
	});

	it("reports the orphaned tasks when the scope is deleted", async () => {
		const { scope, task, epic } = await fixture("Real delete");

		const outcome = (await call("scopes_delete", { id: scope.id })) as {
			scope: { id: number };
			task_ids: string[];
			epic_ids: string[];
			dry_run: boolean;
		};

		expect(outcome.scope.id).toBe(scope.id);
		expect(outcome.dry_run).toBe(false);
		expect(outcome.task_ids).toEqual([task.id]);
		expect(outcome.epic_ids).toEqual([epic.id]);
		expect(getScope(getDb(), scope.id)).toBeUndefined();
		expect(getTask(getDb(), task.id)?.scope_id).toBeNull();
	});

	it("records the lost scope in the activity log", async () => {
		const { scope, task } = await fixture("Real delete log");

		await call("scopes_delete", { id: scope.id });

		const entry = history(task.id).find((item) => item.op === "scopes_delete");
		expect(entry?.changes).toEqual([
			{ field: "scope_id", from: scope.id, to: null },
		]);
	});

	it("fails for an unknown scope", async () => {
		await expect(
			call("scopes_delete", { id: 999, dry_run: true }),
		).rejects.toMatchObject({
			status: 404,
			body: { message: "scope 999 not found" },
		});
		await expect(call("scopes_delete", { id: 999 })).rejects.toMatchObject({
			status: 404,
			body: { message: "scope 999 not found" },
		});
	});
});
