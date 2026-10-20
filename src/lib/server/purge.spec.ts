import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { addComment } from "./comments";
import { type AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { purgeSoftDeletedTasks } from "./purge";
import { createProject } from "./projects";
import { createTask, deleteTask, getTask, listTasks } from "./tasks";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

async function setup(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	return db;
}

const now = new Date("2026-10-20T12:00:00.000Z");
const daysAgo = (days: number) =>
	new Date(now.getTime() - days * 86_400_000).toISOString();

describe("purge", () => {
	it("removes tasks soft-deleted before the cutoff and keeps the rest", async () => {
		const db = await setup();
		const old = unwrap(createTask(db, { project_id: "spa", title: "old" }));
		const fresh = unwrap(createTask(db, { project_id: "spa", title: "fresh" }));
		const alive = unwrap(createTask(db, { project_id: "spa", title: "alive" }));

		unwrap(deleteTask(db, old.id));
		unwrap(deleteTask(db, fresh.id));
		db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(
			daysAgo(120),
			old.id,
		);
		db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(
			daysAgo(10),
			fresh.id,
		);

		expect(purgeSoftDeletedTasks(db, 90, now)).toBe(1);

		expect(getTask(db, old.id)).toBeUndefined();
		expect(
			db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE id = ?").get(old.id),
		).toEqual({ c: 0 });
		expect(
			db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE id = ?").get(fresh.id),
		).toEqual({ c: 1 });
		expect(
			db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE id = ?").get(alive.id),
		).toEqual({ c: 1 });
	});

	it("takes the comments of a purged task with it", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(addComment(db, { task_id: task.id, body: "note" }));
		unwrap(deleteTask(db, task.id));
		db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(
			daysAgo(120),
			task.id,
		);

		expect(purgeSoftDeletedTasks(db, 90, now)).toBe(1);
		expect(db.prepare("SELECT COUNT(*) AS c FROM task_comments").get()).toEqual(
			{
				c: 0,
			},
		);
		expect(
			db.prepare("SELECT COUNT(*) AS c FROM task_revisions").get(),
		).toEqual({ c: 0 });
	});

	it("keeps the task number reserved after the purge", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(deleteTask(db, task.id));
		db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(
			daysAgo(120),
			task.id,
		);
		expect(purgeSoftDeletedTasks(db, 90, now)).toBe(1);

		const next = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		expect(next.id).toBe("SPA-2");
	});

	it("does nothing when there is nothing to purge", async () => {
		const db = await setup();

		expect(purgeSoftDeletedTasks(db, 90, now)).toBe(0);
		expect(listTasks(db, {})).toHaveLength(0);
	});
});
