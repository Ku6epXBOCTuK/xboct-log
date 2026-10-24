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

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-list-filters-"));
	const db = getDb(join(dbDir, "list-filters.db"));
	await migrateDatabase(db);
	for (const project of [
		{ id: "spa", name: "Shop", prefix: "SPA" },
		{ id: "bil", name: "Billing", prefix: "BIL" },
		{ id: "old", name: "Old", prefix: "OLD" },
	]) {
		const created = createProject(db, project);
		expect(created.isOk()).toBe(true);
	}
	for (const project of ["spa", "bil", "old"]) {
		const task = createTask(db, {
			project_id: project,
			title: `${project} task`,
		});
		expect(task.isOk()).toBe(true);
	}
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

async function total(input: unknown): Promise<{
	total: number;
	projects: string[];
}> {
	const result = (await runOp(op("tasks_list"), input, "mcp")) as {
		items: { project_id: string }[];
		total: number;
	};
	return {
		total: result.total,
		projects: result.items.map((item) => item.project_id).sort(),
	};
}

describe("tasks_list list filters", () => {
	it("advertises the string list filters as plain arrays", () => {
		const schema = z.toJSONSchema(op("tasks_list").input) as unknown as {
			properties: Record<
				string,
				{ type?: string; anyOf?: { type?: string }[] }
			>;
		};
		for (const name of ["project_id", "exclude_project_id"]) {
			const prop = schema.properties[name];
			expect(prop.type).toBe("array");
			expect(prop.anyOf).toBeUndefined();
		}
		const epic = schema.properties.epic_id;
		for (const branch of epic.anyOf ?? [epic]) {
			expect(branch.type).not.toBe("string");
		}
	});

	it("parses JSON-encoded and comma-separated strings into lists", () => {
		const parsed = op("tasks_list").input.parse({
			project_id: '["spa", "bil"]',
			exclude_project_id: "old, brd",
			epic_id: '["SPA-1"]',
			status: "open",
		}) as {
			project_id?: string[];
			exclude_project_id?: string[];
			epic_id?: string[];
			status?: string[];
		};
		expect(parsed.project_id).toEqual(["spa", "bil"]);
		expect(parsed.exclude_project_id).toEqual(["old", "brd"]);
		expect(parsed.epic_id).toEqual(["SPA-1"]);
		expect(parsed.status).toEqual(["open"]);
	});

	it("keeps arrays and null as they are", () => {
		const parsed = op("tasks_list").input.parse({
			project_id: ["spa"],
			epic_id: null,
		}) as { project_id?: string[]; epic_id?: string[] | null };
		expect(parsed.project_id).toEqual(["spa"]);
		expect(parsed.epic_id).toBeNull();
	});

	it("matches the same tasks for array, JSON string and comma string", async () => {
		const viaArray = await total({ project_id: ["spa", "bil"] });
		const viaJson = await total({ project_id: '["spa", "bil"]' });
		const viaComma = await total({ project_id: "spa,bil" });
		expect(viaArray).toEqual({ total: 2, projects: ["bil", "spa"] });
		expect(viaJson).toEqual(viaArray);
		expect(viaComma).toEqual(viaArray);
	});

	it("excludes every project of a JSON-encoded list", async () => {
		const excluded = await total({ exclude_project_id: '["spa", "bil"]' });
		expect(excluded).toEqual({ total: 1, projects: ["old"] });
	});

	it("filters by a JSON-encoded epic list", async () => {
		const db = getDb();
		const epic = createTask(db, {
			project_id: "spa",
			title: "Epic",
			is_epic: true,
		});
		expect(epic.isOk()).toBe(true);
		if (!epic.isOk()) return;
		const child = createTask(db, {
			project_id: "spa",
			title: "Child",
			epic_id: epic.value.id,
		});
		expect(child.isOk()).toBe(true);

		const viaJson = await total({ epic_id: JSON.stringify([epic.value.id]) });
		const viaArray = await total({ epic_id: [epic.value.id] });
		expect(viaJson).toEqual(viaArray);
		expect(viaJson.projects).toEqual(["spa"]);
	});
});
