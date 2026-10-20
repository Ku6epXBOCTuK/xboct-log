import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { pruneActivity } from "./activity";
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
});
