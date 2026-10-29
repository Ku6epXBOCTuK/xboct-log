import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask, ensureTag } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

beforeEach(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-tags-"));
	const db = getDb(join(dbDir, "tags.db"));
	await migrateDatabase(db);
	const project = createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	expect(project.isOk()).toBe(true);
	for (const tag of ["mcp", "ui", "db"]) {
		expect(ensureTag(db, tag).isOk()).toBe(true);
	}
	const task = createTask(db, {
		project_id: "spa",
		title: "Alpha",
		status: "open",
		tags: ["mcp", "ui"],
	});
	expect(task.isOk()).toBe(true);
	const other = createTask(db, {
		project_id: "spa",
		title: "Beta",
		status: "open",
		tags: ["mcp"],
	});
	expect(other.isOk()).toBe(true);
});

afterEach(() => {
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

describe("tags_list", () => {
	it("is registered as a query", () => {
		expect(getOps().get("tags_list")?.kind).toBe("query");
	});

	it("returns the tag dictionary with counts", async () => {
		const result = (await runOp(op("tags_list"), {}, "mcp")) as {
			items: { tag: string; count: number }[];
			total: number;
		};

		expect(result.total).toBe(2);
		expect(result.items).toEqual([
			{ tag: "mcp", count: 2, active: 2 },
			{ tag: "ui", count: 1, active: 1 },
		]);
	});

	it("filters by status", async () => {
		const result = (await runOp(
			op("tags_list"),
			{ status: "open" },
			"mcp",
		)) as {
			items: { tag: string; count: number }[];
		};

		expect(result.items).toEqual([
			{ tag: "mcp", count: 2, active: 2 },
			{ tag: "ui", count: 1, active: 1 },
		]);
	});

	it("matches the same tags for status array and JSON string", async () => {
		const viaArray = (await runOp(
			op("tags_list"),
			{ status: ["open"] },
			"mcp",
		)) as { items: unknown[] };
		const viaJson = (await runOp(
			op("tags_list"),
			{ status: '["open"]' },
			"mcp",
		)) as { items: unknown[] };

		expect(viaArray.items).toHaveLength(2);
		expect(viaJson.items).toEqual(viaArray.items);
	});

	it("normalizes status and project_id string forms", () => {
		const parsed = op("tags_list").input.parse({
			status: '["open", "done"]',
			project_id: "spa, bil",
		}) as { status?: string[]; project_id?: string[] };

		expect(parsed.status).toEqual(["open", "done"]);
		expect(parsed.project_id).toEqual(["spa", "bil"]);
	});

	it("filters by a JSON-encoded project list", async () => {
		const db = getDb();
		const project = createProject(db, {
			id: "bil",
			name: "Billing",
			prefix: "BIL",
		});
		expect(project.isOk()).toBe(true);
		const task = createTask(db, {
			project_id: "bil",
			title: "Gamma",
			status: "open",
			tags: ["db"],
		});
		expect(task.isOk()).toBe(true);

		const result = (await runOp(
			op("tags_list"),
			{ project_id: '["bil"]' },
			"mcp",
		)) as { items: { tag: string; count: number }[] };

		expect(result.items).toEqual([{ tag: "db", count: 1, active: 1 }]);
	});

	it("rejects an unknown parameter", async () => {
		await expect(
			runOp(op("tags_list"), { project: "spa" }, "mcp"),
		).rejects.toThrow();
	});
});
