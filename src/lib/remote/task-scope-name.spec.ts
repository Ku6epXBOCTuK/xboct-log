import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import type { AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createScope } from "../server/scopes";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;
let siteId: number;
let editorId: number;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-scope-name-"));
	const db = getDb(join(dbDir, "scope-name.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "web", name: "Web", prefix: "WEB" }));
	unwrap(createProject(db, { id: "other", name: "Other", prefix: "OTH" }));
	siteId = unwrap(createScope(db, { project_id: "web", name: "site" })).id;
	editorId = unwrap(createScope(db, { project_id: "web", name: "editor" })).id;
	unwrap(createScope(db, { project_id: "other", name: "site" }));
	unwrap(createScope(db, { project_id: "other", name: "billing" }));
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

async function failure(name: string, input: unknown): Promise<string> {
	try {
		await call(name, input);
	} catch (error) {
		const body = (error as { body?: { message?: string } }).body;
		return body?.message ?? String(error);
	}
	throw new Error(`expected ${name} to fail`);
}

interface Created {
	id: string;
	scope_id: number | null;
}

describe("scope name on create", () => {
	it("resolves the name inside the project, ignoring case and padding", async () => {
		const created = (await call("tasks_create", {
			project_id: "web",
			title: "Named scope",
			scope: "  SITE ",
		})) as Created;

		expect(created.scope_id).toBe(siteId);
	});

	it("accepts scope and a matching scope_id", async () => {
		const created = (await call("tasks_create", {
			project_id: "web",
			title: "Same scope twice",
			scope: "editor",
			scope_id: editorId,
		})) as Created;

		expect(created.scope_id).toBe(editorId);
	});

	it("lists the scopes of the project when the name is unknown", async () => {
		const message = await failure("tasks_create", {
			project_id: "web",
			title: "Bad scope",
			scope: "frontend",
		});

		expect(message).toContain('unknown scope "frontend"');
		expect(message).toContain(`site (${siteId})`);
		expect(message).toContain(`editor (${editorId})`);
		expect(message).toContain("scopes_list");
	});

	it("does not take a scope of another project", async () => {
		const message = await failure("tasks_create", {
			project_id: "web",
			title: "Foreign name",
			scope: "billing",
		});

		expect(message).toContain('unknown scope "billing"');
	});

	it("rejects an empty name", async () => {
		const message = await failure("tasks_create", {
			project_id: "web",
			title: "Empty scope",
			scope: "   ",
		});

		expect(message).toContain("scope name is empty");
	});

	it("rejects scope and scope_id that disagree", async () => {
		const message = await failure("tasks_create", {
			project_id: "web",
			title: "Disagreeing scope",
			scope: "site",
			scope_id: editorId,
		});

		expect(message).toContain("scope and scope_id disagree");
	});

	it("fails only the item with a bad scope in a batch", async () => {
		const result = (await call("tasks_create_many", {
			items: [
				{ project_id: "web", title: "Batch by name", scope: "site" },
				{ project_id: "web", title: "Batch bad", scope: "nowhere" },
			],
		})) as {
			succeeded: number;
			failed: number;
			items: {
				ok: boolean;
				task?: { scope_id: number | null };
				error?: { message: string };
			}[];
		};

		expect(result.succeeded).toBe(1);
		expect(result.failed).toBe(1);
		expect(result.items[0].task?.scope_id).toBe(siteId);
		expect(result.items[1].error?.message).toContain('unknown scope "nowhere"');
	});
});

describe("scope name on update", () => {
	it("moves the task to another scope by name", async () => {
		const created = (await call("tasks_create", {
			project_id: "web",
			title: "Move by name",
			scope: "site",
		})) as Created;

		const updated = (await call("tasks_update", {
			task_id: created.id,
			patch: { scope: "Editor" },
		})) as Created;

		expect(updated.scope_id).toBe(editorId);
	});

	it("clears the scope with null", async () => {
		const created = (await call("tasks_create", {
			project_id: "web",
			title: "Clear by name",
			scope: "site",
		})) as Created;

		const updated = (await call("tasks_update", {
			task_id: created.id,
			patch: { scope: null },
		})) as Created;

		expect(updated.scope_id).toBeNull();
	});

	it("rejects an unknown name on update", async () => {
		const created = (await call("tasks_create", {
			project_id: "web",
			title: "Unknown on update",
		})) as Created;

		const message = await failure("tasks_update", {
			task_id: created.id,
			patch: { scope: "frontend" },
		});

		expect(message).toContain('unknown scope "frontend"');
	});
});
