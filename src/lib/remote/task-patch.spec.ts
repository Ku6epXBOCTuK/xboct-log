import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { type AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask, getTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-task-patch-"));
	const db = getDb(join(dbDir, "patch.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	unwrap(createProject(db, { id: "oth", name: "Other", prefix: "OTH" }));
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

function fixture(title: string) {
	const db = getDb();
	const task = unwrap(createTask(db, { project_id: "spa", title }));
	const epic = unwrap(
		createTask(db, {
			project_id: "spa",
			title: `${title} epic`,
			is_epic: true,
		}),
	);
	return { task, epic };
}

describe("tasks_update patch validation", () => {
	it("rejects an empty patch instead of reporting success", async () => {
		const { task } = fixture("Empty patch");

		await expect(
			call("tasks_update", { id: task.id, patch: {} }),
		).rejects.toMatchObject({
			status: 400,
			body: {
				message:
					"patch is empty: name at least one field to change (a field set to undefined is not a value)",
			},
		});
	});

	it("rejects a field set to undefined", async () => {
		const { task, epic } = fixture("Undefined field");

		await expect(
			call("tasks_update", { id: task.id, patch: { epic_id: undefined } }),
		).rejects.toMatchObject({
			status: 400,
			body: {
				message:
					"patch field(s) epic_id are undefined: pass a value or leave the field out",
			},
		});
		expect(getTask(getDb(), task.id)?.epic_id).toBeNull();
		expect(epic.id).toBeTruthy();
	});

	it("rejects an unknown patch field", async () => {
		const { task } = fixture("Unknown field");

		await expect(
			call("tasks_update", { id: task.id, patch: { epic: task.id } }),
		).rejects.toBeDefined();
	});

	it("rejects an epic id that does not exist", async () => {
		const { task } = fixture("Missing epic");

		await expect(
			call("tasks_update", { id: task.id, patch: { epic_id: "SPA-9999" } }),
		).rejects.toMatchObject({
			status: 404,
			body: { message: "epic SPA-9999 not found" },
		});
	});

	it("rejects an epic from another project", async () => {
		const { task } = fixture("Foreign epic");
		const foreign = unwrap(
			createTask(getDb(), {
				project_id: "oth",
				title: "Foreign epic",
				is_epic: true,
			}),
		);

		await expect(
			call("tasks_update", { id: task.id, patch: { epic_id: foreign.id } }),
		).rejects.toMatchObject({
			status: 400,
			body: { message: "epic must belong to the same project" },
		});
	});

	it("applies a valid patch", async () => {
		const { task, epic } = fixture("Valid patch");

		const updated = (await call("tasks_update", {
			id: task.id,
			patch: { epic_id: epic.id, priority: "high" },
		})) as { epic_id: string; priority: string };

		expect(updated.epic_id).toBe(epic.id);
		expect(updated.priority).toBe("high");
	});
});

describe("tasks_update_many patch validation", () => {
	it("reports the failing item and keeps the other items updated", async () => {
		const db = getDb();
		const good = unwrap(createTask(db, { project_id: "spa", title: "Good" }));
		const bad = unwrap(createTask(db, { project_id: "spa", title: "Bad" }));

		const result = (await call("tasks_update_many", {
			items: [
				{ id: good.id, patch: { priority: "high" } },
				{ id: bad.id, patch: {} },
			],
		})) as {
			items: {
				id: string;
				ok: boolean;
				error?: { kind: string; message: string };
			}[];
			succeeded: number;
			failed: number;
		};

		expect(result.succeeded).toBe(1);
		expect(result.failed).toBe(1);
		expect(result.items[0]).toMatchObject({ id: good.id, ok: true });
		expect(result.items[1]).toMatchObject({
			id: bad.id,
			ok: false,
			error: {
				kind: "validation",
				message:
					"patch is empty: name at least one field to change (a field set to undefined is not a value)",
			},
		});
		expect(getTask(db, good.id)?.priority).toBe("high");
		expect(getTask(db, bad.id)?.priority).toBe("medium");
	});

	it("reports an undefined field per item", async () => {
		const db = getDb();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Undefined" }),
		);

		const result = (await call("tasks_update_many", {
			items: [{ id: task.id, patch: { epic_id: undefined } }],
		})) as {
			items: {
				ok: boolean;
				error?: { kind: string; message: string };
			}[];
			succeeded: number;
			failed: number;
		};

		expect(result.succeeded).toBe(0);
		expect(result.failed).toBe(1);
		expect(result.items[0]).toMatchObject({
			ok: false,
			error: {
				kind: "validation",
				message:
					"patch field(s) epic_id are undefined: pass a value or leave the field out",
			},
		});
		expect(getTask(db, task.id)?.epic_id).toBeNull();
	});
});
