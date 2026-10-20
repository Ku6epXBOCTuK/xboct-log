import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { listActivity, pruneActivity } from "./activity";
import { openMigratedDatabase } from "./migrations";

async function setup(): Promise<DatabaseSync> {
	return openMigratedDatabase(":memory:");
}

function insertActivity(db: DatabaseSync, createdAt: string): void {
	db.prepare(
		`INSERT INTO activity (created_at, source, op, entity, entity_id, fields)
		 VALUES (?, 'mcp', 'tasks_update', 'task', 'LOG-1', '["status"]')`,
	).run(createdAt);
}

function countActivity(db: DatabaseSync): number {
	const row = db
		.prepare("SELECT COUNT(*) AS count FROM activity")
		.get() as unknown as {
		count: number;
	};
	return row.count;
}

describe("activity", () => {
	it("drops rows older than the retention window and keeps the rest", async () => {
		const db = await setup();
		const now = new Date("2026-10-20T12:00:00.000Z");
		insertActivity(db, "2026-10-19T12:00:00.000Z");
		insertActivity(db, "2025-06-01T12:00:00.000Z");

		const removed = pruneActivity(db, 365, now);

		expect(removed).toBe(1);
		expect(countActivity(db)).toBe(1);
	});

	it("does nothing when the activity table is missing", async () => {
		const db = await setup();
		db.exec("DROP TABLE activity");

		expect(pruneActivity(db)).toBe(0);
	});

	it("returns the events of one entity, newest first", async () => {
		const db = await setup();
		insertActivity(db, "2026-10-19T12:00:00.000Z");
		db.prepare(
			`INSERT INTO activity (created_at, source, op, entity, entity_id, fields)
			 VALUES (?, 'ui', 'tasks_close', 'task', 'LOG-1', '["status","closed_reason"]')`,
		).run("2026-10-20T12:00:00.000Z");
		db.prepare(
			`INSERT INTO activity (created_at, source, op, entity, entity_id, fields)
			 VALUES (?, 'ui', 'projects_update', 'project', 'LOG-1', '["name"]')`,
		).run("2026-10-20T13:00:00.000Z");

		const result = listActivity(db, { entity: "task", entity_id: "LOG-1" });

		expect(result.total).toBe(2);
		expect(result.items.map((item) => item.op)).toEqual([
			"tasks_close",
			"tasks_update",
		]);
		expect(result.items[0]).toEqual({
			ts: "2026-10-20T12:00:00.000Z",
			source: "ui",
			op: "tasks_close",
			fields: ["status", "closed_reason"],
			old_id: null,
		});
	});

	it("keeps the history of a task that was moved", async () => {
		const db = await setup();
		db.prepare(
			`INSERT INTO activity (created_at, source, op, entity, entity_id, old_id, fields)
			 VALUES (?, 'ui', 'tasks_move', 'task', 'BIL-1', 'SPA-1', '["project_id"]')`,
		).run("2026-10-20T12:00:00.000Z");
		db.prepare(
			`INSERT INTO activity (created_at, source, op, entity, entity_id, fields)
			 VALUES (?, 'ui', 'tasks_update', 'task', 'SPA-1', '["status"]')`,
		).run("2026-10-19T12:00:00.000Z");

		expect(listActivity(db, { entity: "task", entity_id: "BIL-1" }).total).toBe(
			1,
		);
		expect(listActivity(db, { entity: "task", entity_id: "SPA-1" }).total).toBe(
			2,
		);
	});

	it("limits the number of returned events but counts them all", async () => {
		const db = await setup();
		insertActivity(db, "2026-10-18T12:00:00.000Z");
		insertActivity(db, "2026-10-19T12:00:00.000Z");
		insertActivity(db, "2026-10-20T12:00:00.000Z");

		const result = listActivity(db, {
			entity: "task",
			entity_id: "LOG-1",
			limit: 2,
		});

		expect(result.total).toBe(3);
		expect(result.items).toHaveLength(2);
	});

	it("returns nothing when the activity table is missing", async () => {
		const db = await setup();
		db.exec("DROP TABLE activity");

		expect(listActivity(db, { entity: "task", entity_id: "LOG-1" })).toEqual({
			items: [],
			total: 0,
		});
	});
});
