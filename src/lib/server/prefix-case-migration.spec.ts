import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrateDatabase, openMigratedDatabase } from "./migrations";
import { resolveTaskId } from "./tasks";

const STAMP = "2026-01-01T00:00:00.000Z";

const DROP_PREFIX_TRIGGERS = `
DROP TRIGGER IF EXISTS trg_projects_prefix_nocase_insert;
DROP TRIGGER IF EXISTS trg_projects_prefix_nocase_update;
DROP TRIGGER IF EXISTS trg_projects_prefix_upper_insert;
DROP TRIGGER IF EXISTS trg_projects_prefix_upper_update;
`;

async function legacyDatabase(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	db.exec(`
${DROP_PREFIX_TRIGGERS}

INSERT INTO projects (id, name, prefix, created_at)
VALUES ('legacy', 'Legacy', 'leg', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, created_at, updated_at)
VALUES ('leg-1', 'legacy', 1, 'Epic', '', 'open', 'medium', 1, '${STAMP}', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, epic_id, created_at, updated_at)
VALUES ('leg-2', 'legacy', 2, 'Child', '', 'open', 'medium', 0, 'leg-1', '${STAMP}', '${STAMP}');

INSERT INTO task_blocked_by (blocked_task_id, blocked_by_task_id, created_at)
VALUES ('leg-2', 'leg-1', '${STAMP}');

INSERT INTO activity (created_at, source, op, entity, entity_id, old_id)
VALUES ('${STAMP}', 'test', 'move', 'task', 'leg-2', 'leg-1');

DELETE FROM schema_migrations WHERE name LIKE '006%';
`);
	return db;
}

async function conflictDatabase(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	db.exec(`
${DROP_PREFIX_TRIGGERS}

INSERT INTO projects (id, name, prefix, created_at)
VALUES ('upper', 'Upper', 'LOG', '${STAMP}');

INSERT INTO projects (id, name, prefix, created_at)
VALUES ('lower', 'Lower', 'log', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, created_at, updated_at)
VALUES ('LOG-1', 'upper', 1, 'Upper task', '', 'open', 'medium', 0, '${STAMP}', '${STAMP}');

INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, created_at, updated_at)
VALUES ('log-1', 'lower', 1, 'Lower task', '', 'open', 'medium', 0, '${STAMP}', '${STAMP}');

DELETE FROM schema_migrations WHERE name LIKE '006%';
`);
	return db;
}

describe("prefix case migration", () => {
	it("uppercases legacy prefixes and rewrites task ids", async () => {
		const db = await legacyDatabase();

		await migrateDatabase(db);

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

		await migrateDatabase(db);

		expect(
			db.prepare("SELECT epic_id FROM tasks WHERE id = 'LEG-2'").get(),
		).toEqual({ epic_id: "LEG-1" });
		expect(
			db
				.prepare(
					"SELECT blocked_task_id, blocked_by_task_id FROM task_blocked_by",
				)
				.get(),
		).toEqual({ blocked_task_id: "LEG-2", blocked_by_task_id: "LEG-1" });
		expect(
			db
				.prepare("SELECT entity_id, old_id FROM activity WHERE entity = 'task'")
				.get(),
		).toEqual({ entity_id: "LEG-2", old_id: "LEG-1" });
	});

	it("leaves the migrated tasks resolvable by their new id", async () => {
		const db = await legacyDatabase();

		await migrateDatabase(db);

		const resolved = resolveTaskId(db, "LEG-1");
		expect(resolved.isOk()).toBe(true);
		expect(resolved._unsafeUnwrap()).toBe("LEG-1");
	});

	it("is idempotent", async () => {
		const db = await legacyDatabase();

		await migrateDatabase(db);
		await migrateDatabase(db);

		expect(
			db.prepare("SELECT prefix FROM projects WHERE id = 'legacy'").get(),
		).toEqual({ prefix: "LEG" });
		expect(db.prepare("SELECT count(*) AS count FROM tasks").get()).toEqual({
			count: 2,
		});
	});

	it("gives a conflicting case variant a numbered prefix", async () => {
		const db = await conflictDatabase();

		await migrateDatabase(db);

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

		await migrateDatabase(db);

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

	it("leaves no lowercase prefix or task id behind", async () => {
		const db = await conflictDatabase();

		await migrateDatabase(db);

		expect(db.prepare("SELECT count(*) AS count FROM projects").get()).toEqual({
			count: 2,
		});
		expect(
			db
				.prepare(
					"SELECT count(*) AS count FROM projects WHERE prefix <> upper(prefix)",
				)
				.get(),
		).toEqual({ count: 0 });
		expect(
			db
				.prepare("SELECT count(*) AS count FROM tasks WHERE id <> upper(id)")
				.get(),
		).toEqual({ count: 0 });
	});
});
