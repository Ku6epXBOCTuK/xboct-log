import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../server/db";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { statusCounts } from "../server/status-counts-test-kit";
import { closeTask, createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-projects-"));
	const db = getDb(join(dbDir, "projects.db"));
	await migrateDatabase(db);
	const shop = createProject(db, {
		id: "spa",
		name: "Shop",
		prefix: "SPA",
		repo: "https://github.com/acme/shop.git",
	});
	expect(shop.isOk()).toBe(true);
	const billing = createProject(db, {
		id: "bil",
		name: "Billing",
		prefix: "BIL",
	});
	expect(billing.isOk()).toBe(true);
	const open = createTask(db, {
		project_id: "spa",
		title: "Open",
		status: "open",
	});
	expect(open.isOk()).toBe(true);
	const done = createTask(db, { project_id: "spa", title: "Done" });
	expect(done.isOk()).toBe(true);
	const closed = closeTask(db, done._unsafeUnwrap().id, "fixed");
	expect(closed.isOk()).toBe(true);
	const epic = createTask(db, {
		project_id: "spa",
		title: "Epic",
		status: "open",
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
	repo: string | null;
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
		expect(spa?.task_counts).toEqual(statusCounts({ open: 1, done: 1 }));
		expect(spa?.epic_counts).toEqual(statusCounts({ open: 1 }));
		expect(spa?.repo).toBe("github.com/acme/shop");
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

	it("finds a project by repository, normalizing the input", async () => {
		for (const repo of [
			"github.com/acme/shop",
			"https://github.com/acme/shop.git",
			"git@github.com:acme/shop.git",
			"GITHUB.COM/acme/shop",
			"https://GitHub.com/Acme/Shop.git",
		]) {
			const items = await listProjects({ repo });
			expect(items.map((project) => project.id)).toEqual(["spa"]);
		}
	});

	it("returns nothing for an unknown repository", async () => {
		const items = await listProjects({ repo: "github.com/acme/ghost" });
		expect(items).toEqual([]);
	});

	it("matches the repository through q", async () => {
		const items = await listProjects({ q: "acme/shop" });
		expect(items.map((project) => project.id)).toEqual(["spa"]);
	});

	it("sets and clears the repository, sharing one between projects", async () => {
		const shared = "github.com/acme/shop";
		const patched = (await runOp(
			op("projects_update"),
			{ id: "bil", patch: { repo: "git@github.com:acme/billing.git" } },
			"mcp",
		)) as ListedProject;
		expect(patched.repo).toBe("github.com/acme/billing");

		await runOp(
			op("projects_update"),
			{ id: "bil", patch: { repo: shared } },
			"mcp",
		);
		const both = await listProjects({ repo: shared });
		expect(both.map((project) => project.id).sort()).toEqual(["bil", "spa"]);

		const cleared = (await runOp(
			op("projects_update"),
			{ id: "bil", patch: { repo: null } },
			"mcp",
		)) as ListedProject;
		expect(cleared.repo).toBeNull();
		expect((await listProjects({ repo: shared })).map((p) => p.id)).toEqual([
			"spa",
		]);
	});

	it("creates a project with a repository", async () => {
		const created = (await runOp(
			op("projects_create"),
			{
				id: "aux",
				name: "Aux",
				prefix: "AUX",
				repo: "git@github.com:acme/aux.git",
			},
			"mcp",
		)) as ListedProject;
		expect(created.repo).toBe("github.com/acme/aux");
		expect(
			(await listProjects({ repo: "github.com/acme/aux" })).map((p) => p.id),
		).toEqual(["aux"]);
	});

	it("rejects a broken repository", async () => {
		await expect(listProjects({ repo: "shop" })).rejects.toThrow();
		await expect(
			runOp(
				op("projects_update"),
				{ id: "bil", patch: { repo: "nope" } },
				"mcp",
			),
		).rejects.toThrow();
	});
});
