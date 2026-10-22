import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-tags-"));
	const db = getDb(join(dbDir, "tags.db"));
	await migrateDatabase(db);
	const project = createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	expect(project.isOk()).toBe(true);
	const task = createTask(db, {
		project_id: "spa",
		title: "Alpha",
		tags: ["mcp", "ui"],
	});
	expect(task.isOk()).toBe(true);
	const other = createTask(db, {
		project_id: "spa",
		title: "Beta",
		tags: ["mcp"],
	});
	expect(other.isOk()).toBe(true);
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

	it("rejects an unknown parameter", async () => {
		await expect(
			runOp(op("tags_list"), { project: "spa" }, "mcp"),
		).rejects.toThrow();
	});
});
