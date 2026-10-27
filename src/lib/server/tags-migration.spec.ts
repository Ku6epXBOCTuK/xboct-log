import type { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import {
	applyMigrations,
	cleanupMigrationDirs,
	createDb,
	migrationNames,
} from "./migrations-test-kit";

const NAMES = migrationNames();
const BEFORE_TAGS = NAMES.slice(0, NAMES.indexOf("020_tags.js"));
const THROUGH_TAGS = NAMES.slice(0, NAMES.indexOf("021_task_tags.js") + 1);

let db: DatabaseSync;

function insertTask(id: string, tags: string[]) {
	db.prepare(
		`INSERT INTO tasks (id, project_id, number, title, status, priority, tags, created_at, updated_at)
		 VALUES (?, 'inbox', ?, ?, 'open', 'medium', ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
	).run(id, Number(id.split("-")[1]), `task ${id}`, JSON.stringify(tags));
}

afterAll(() => {
	db.close();
	cleanupMigrationDirs();
});

describe("tags migration", () => {
	it("renames legacy tag names instead of failing the task_tags foreign key", async () => {
		db = createDb();
		db.exec("PRAGMA foreign_keys = ON;");
		await applyMigrations(db, BEFORE_TAGS);
		db.prepare(
			"INSERT INTO projects (id, name, prefix, created_at) VALUES ('inbox', 'Inbox', 'INB', '2026-10-01T00:00:00.000Z')",
		).run();
		insertTask("INB-1", ["est:L", "ui\\ux", "bug"]);
		insertTask("INB-2", ["MCP", "est:l"]);

		await applyMigrations(db, THROUGH_TAGS);

		const names = db
			.prepare("SELECT name FROM tags ORDER BY name")
			.all()
			.map((row) => row.name);
		expect(names).toEqual(["bug", "est-l", "mcp", "ui-ux"]);

		const links = db
			.prepare("SELECT task_id, tag FROM task_tags ORDER BY task_id, tag")
			.all();
		expect(links).toEqual([
			{ task_id: "INB-1", tag: "bug" },
			{ task_id: "INB-1", tag: "est-l" },
			{ task_id: "INB-1", tag: "ui-ux" },
			{ task_id: "INB-2", tag: "est-l" },
			{ task_id: "INB-2", tag: "mcp" },
		]);
		expect(
			db
				.prepare(
					"SELECT COUNT(*) AS count FROM task_tags tt LEFT JOIN tags t ON t.name = tt.tag WHERE t.name IS NULL",
				)
				.get().count,
		).toBe(0);
		expect(
			db
				.prepare("PRAGMA table_info(tasks)")
				.all()
				.some((column) => column.name === "tags"),
		).toBe(false);
	});
});
