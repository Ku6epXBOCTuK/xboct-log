import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { closeTask, createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-projects-"));
	const db = getDb(join(dbDir, "projects.db"));
	await migrateDatabase(db);
	const shop = createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	expect(shop.isOk()).toBe(true);
	const billing = createProject(db, {
		id: "bil",
		name: "Billing",
		prefix: "BIL",
	});
	expect(billing.isOk()).toBe(true);
	const open = createTask(db, { project_id: "spa", title: "Open" });
	expect(open.isOk()).toBe(true);
	const done = createTask(db, { project_id: "spa", title: "Done" });
	expect(done.isOk()).toBe(true);
	const closed = closeTask(db, done._unsafeUnwrap().id, "fixed");
	expect(closed.isOk()).toBe(true);
	const epic = createTask(db, {
		project_id: "spa",
		title: "Epic",
		is_epic: true,
	});
	expect(epic.isOk()).toBe(true);
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

interface ListedProject {
	id: string;
	name: string;
	task_counts: Record<string, number>;
	epic_counts: Record<string, number>;
}

async function listProjects(input: unknown): Promise<ListedProject[]> {
	return (await runOp(op("projects_list"), input, "mcp")) as ListedProject[];
}

describe("projects_list", () => {
	it("returns task and epic counts for every project", async () => {
		const items = await listProjects({});
		const spa = items.find((project) => project.id === "spa");
		expect(spa?.task_counts).toEqual({
			open: 1,
			"in-progress": 0,
			blocked: 0,
			done: 1,
			cancelled: 0,
		});
		expect(spa?.epic_counts).toEqual({
			open: 1,
			"in-progress": 0,
			blocked: 0,
			done: 0,
			cancelled: 0,
		});
	});

	it("finds projects by name, id and prefix case-insensitively", async () => {
		for (const q of ["shop", "SHOP", "spa", "SPA"]) {
			const items = await listProjects({ q });
			expect(items.map((project) => project.id)).toEqual(["spa"]);
		}
		for (const q of ["billing", "bil", "BIL"]) {
			const items = await listProjects({ q });
			expect(items.map((project) => project.id)).toEqual(["bil"]);
		}
	});

	it("returns nothing for an unknown query", async () => {
		const items = await listProjects({ q: "ghost" });
		expect(items).toEqual([]);
	});
});
