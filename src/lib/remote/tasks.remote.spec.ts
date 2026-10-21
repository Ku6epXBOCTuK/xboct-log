import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";
import { TASK_LIST_FIELDS } from "../server/tasks/field-names";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-fields-"));
	const db = getDb(join(dbDir, "fields.db"));
	await migrateDatabase(db);
	const project = createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	expect(project.isOk()).toBe(true);
	const task = createTask(db, {
		project_id: "spa",
		title: "Alpha",
		description: "first line\nsecond line",
	});
	expect(task.isOk()).toBe(true);
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

async function list(input: unknown): Promise<Record<string, unknown>> {
	const result = (await runOp(op("tasks_list"), input, "mcp")) as {
		items: Record<string, unknown>[];
	};
	return result.items[0];
}

function fieldsDescription(): string {
	const schema = z.toJSONSchema(op("tasks_list").input) as unknown as {
		properties: { fields: { description: string } };
	};
	return schema.properties.fields.description;
}

describe("tasks_list fields parameter", () => {
	it("names every supported field in the parameter description", () => {
		const description = fieldsDescription();
		for (const field of TASK_LIST_FIELDS) {
			expect(description).toContain(field);
		}
	});

	it("documents the behavior for unknown field names", () => {
		expect(fieldsDescription()).toContain("Unknown field names are ignored");
	});

	it("matches the documented list with the returned task", async () => {
		const task = await list({
			include_project: true,
			include_scope: true,
			include_description: true,
		});
		expect(Object.keys(task).sort()).toEqual(
			TASK_LIST_FIELDS.filter((field) => field !== "short_description").sort(),
		);
	});

	it("documents the short description instead of the full text", async () => {
		const task = await list({ include_project: true, include_scope: true });
		const keys = Object.keys(task);
		expect(keys).toContain("short_description");
		expect(keys).not.toContain("description");
		expect(keys.sort()).toEqual(
			TASK_LIST_FIELDS.filter((field) => field !== "description").sort(),
		);
	});

	it("returns the full description instead of the short one on request", async () => {
		const task = await list({ include_description: true });
		expect(task.description).toBe("first line\nsecond line");
		expect(Object.keys(task)).not.toContain("short_description");
	});

	it("keeps only the requested fields", async () => {
		const task = await list({ fields: "id,title,status" });
		expect(Object.keys(task).sort()).toEqual(["id", "status", "title"]);
	});

	it("ignores unknown field names", async () => {
		const task = await list({ fields: "id,bogus" });
		expect(Object.keys(task)).toEqual(["id"]);
	});
});
