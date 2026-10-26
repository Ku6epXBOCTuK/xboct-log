import type { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { resolveTaskId } from "./tasks";
import {
	applyMigrations,
	cleanupMigrationDirs,
	createDb,
	migrationNames,
	pendingMigrations,
	rollbackLast,
} from "./migrations-test-kit";

const STAMP = "2026-01-01T00:00:00.000Z";

const NAMES = migrationNames();
const PREFIX_INDEX = NAMES.indexOf("006_projects_prefix_case.js");
const BEFORE = NAMES.slice(0, PREFIX_INDEX);
const THROUGH = NAMES.slice(0, PREFIX_INDEX + 1);

const PREFIX_TRIGGERS = [
	"trg_projects_prefix_nocase_insert",
	"trg_projects_prefix_nocase_update",
	"trg_projects_prefix_upper_insert",
	"trg_projects_prefix_upper_update",
];

const openDbs: DatabaseSync[] = [];

function track(db: DatabaseSync): DatabaseSync {
	openDbs.push(db);
	return db;
}

async function databaseBeforePrefixMigration(): Promise<DatabaseSync> {
	const db = track(createDb());
	await applyMigrations(db, BEFORE);
	return db;
}

async function legacyDatabase(): Promise<DatabaseSync> {
	const db = await databaseBeforePrefixMigration();
	db.exec(`
INSERT INTO projects (id, name, prefix, created_at)
VALUES ('legacy', 'Legacy', 'leg', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, created_at, updated_at)
VALUES ('leg-1', 'legacy', 1, 'Epic', '', 'open', 'medium', 1, '${STAMP}', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, epic_id, created_at, updated_at)
VALUES ('leg-2', 'legacy', 2, 'Child', '', 'open', 'medium', 0, 'leg-1', '${STAMP}', '${STAMP}');

INSERT INTO task_blocked_by (blocked_task_id, blocked_by_task_id, created_at)
VALUES ('leg-1', 'leg-2', '${STAMP}');

INSERT INTO activity (created_at, source, op, entity, entity_id, old_id)
VALUES ('${STAMP}', 'test', 'move', 'task', 'leg-2', 'leg-1');
`);
	return db;
}

async function conflictDatabase(): Promise<DatabaseSync> {
	const db = await databaseBeforePrefixMigration();
	db.exec(`
INSERT INTO projects (id, name, prefix, created_at)
VALUES ('upper', 'Upper', 'LOG', '${STAMP}');

INSERT INTO projects (id, name, prefix, created_at)
VALUES ('lower', 'Lower', 'log', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, created_at, updated_at)
VALUES ('LOG-1', 'upper', 1, 'Upper task', '', 'open', 'medium', 0, '${STAMP}', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, created_at, updated_at)
VALUES ('log-1', 'lower', 1, 'Lower task', '', 'open', 'medium', 0, '${STAMP}', '${STAMP}');
`);
	return db;
}

function triggerNames(db: DatabaseSync): string[] {
	return db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
		)
		.all()
		.map((row) => String(row.name));
}

afterEach(() => {
	for (const db of openDbs.splice(0)) {
		db.close();
	}
});

afterAll(() => {
	cleanupMigrationDirs();
});

describe("prefix case migration", () => {
	it("uppercases legacy prefixes and rewrites task ids", async () => {
		const db = await legacyDatabase();

		await applyMigrations(db, THROUGH);

		expect(
			db.prepare("SELECT prefix FROM projects WHERE id = 'legacy'").get(),
		).toEqual({ prefix: "LEG" });
		expect(
			db
				.prepare(
					"SELECT id FROM tasks WHERE project_id = 'legacy' ORDER BY number",
				)
				.all()
				.map((row) => row.id),
		).toEqual(["LEG-1", "LEG-2"]);
	});

	it("rewrites every reference to a rewritten task id", async () => {
		const db = await legacyDatabase();

		await applyMigrations(db, THROUGH);

		expect(
			db.prepare("SELECT epic_id FROM tasks WHERE id = 'LEG-2'").get(),
		).toEqual({ epic_id: "LEG-1" });
		expect(
			db
				.prepare(
					"SELECT blocked_task_id, blocked_by_task_id FROM task_blocked_by",
				)
				.get(),
		).toEqual({ blocked_task_id: "LEG-1", blocked_by_task_id: "LEG-2" });
		expect(
			db
				.prepare("SELECT entity_id, old_id FROM activity WHERE entity = 'task'")
				.get(),
		).toEqual({ entity_id: "LEG-2", old_id: "LEG-1" });
	});

	it("leaves the migrated tasks resolvable by their new id", async () => {
		const db = await legacyDatabase();

		await applyMigrations(db, THROUGH);

		const resolved = resolveTaskId(db, "LEG-1");
		expect(resolved.isOk()).toBe(true);
		expect(resolved._unsafeUnwrap()).toBe("LEG-1");
	});

	it("gives a conflicting case variant a numbered prefix", async () => {
		const db = await conflictDatabase();

		await applyMigrations(db, THROUGH);

		expect(
			db
				.prepare("SELECT id, prefix FROM projects ORDER BY id")
				.all()
				.map((row) => [row.id, row.prefix]),
		).toEqual([
			["lower", "LOG2"],
			["upper", "LOG"],
		]);
		expect(
			db
				.prepare("SELECT id FROM tasks WHERE project_id = 'lower'")
				.all()
				.map((row) => row.id),
		).toEqual(["LOG2-1"]);
	});

	it("skips prefixes that are already taken", async () => {
		const db = await conflictDatabase();
		db.exec(`
INSERT INTO projects (id, name, prefix, created_at)
VALUES ('taken', 'Taken', 'LOG2', '${STAMP}');
`);

		await applyMigrations(db, THROUGH);

		expect(
			db.prepare("SELECT prefix FROM projects WHERE id = 'lower'").get(),
		).toEqual({ prefix: "LOG3" });
		expect(
			db
				.prepare("SELECT id FROM tasks WHERE project_id = 'lower'")
				.all()
				.map((row) => row.id),
		).toEqual(["LOG3-1"]);
	});

	it("installs guards against lowercase and conflicting prefixes", async () => {
		const db = await legacyDatabase();

		await applyMigrations(db, THROUGH);

		expect(triggerNames(db)).toEqual(PREFIX_TRIGGERS.toSorted());
		expect(() =>
			db.exec(`
INSERT INTO projects (id, name, prefix, created_at)
VALUES ('other', 'Other', 'other', '${STAMP}');
`),
		).toThrow("project prefix must be uppercase");
		expect(() =>
			db.exec(`
INSERT INTO projects (id, name, prefix, created_at)
VALUES ('other', 'Other', 'LEG', '${STAMP}');
`),
		).toThrow("project prefix conflicts with an existing prefix");
	});

	it("drops the guards on down and keeps the converted data", async () => {
		const db = await legacyDatabase();

		await applyMigrations(db, THROUGH);
		await rollbackLast(db, THROUGH);

		expect(triggerNames(db)).toEqual([]);
		expect(
			db.prepare("SELECT prefix FROM projects WHERE id = 'legacy'").get(),
		).toEqual({ prefix: "LEG" });
		expect(
			db
				.prepare(
					"SELECT id FROM tasks WHERE project_id = 'legacy' ORDER BY number",
				)
				.all()
				.map((row) => row.id),
		).toEqual(["LEG-1", "LEG-2"]);
	});

	it("reapplies after down without touching the converted data", async () => {
		const db = await legacyDatabase();

		await applyMigrations(db, THROUGH);
		await rollbackLast(db, THROUGH);
		await applyMigrations(db, THROUGH);

		expect(triggerNames(db)).toEqual(PREFIX_TRIGGERS.toSorted());
		expect(
			db
				.prepare(
					"SELECT id FROM tasks WHERE project_id = 'legacy' ORDER BY number",
				)
				.all()
				.map((row) => row.id),
		).toEqual(["LEG-1", "LEG-2"]);
		expect(await pendingMigrations(db, THROUGH)).toBe(0);
	});
});
