import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import { countTasksByStatus, countTasks, createTask, listTasks } from "./tasks";
import type { Status } from "../types";

interface SeededProject {
	id: string;
	name: string;
	prefix: string;
	tasks: number;
}

const PROJECTS: SeededProject[] = [
	{ id: "big", name: "Big", prefix: "BIG", tasks: 900 },
	{ id: "mid", name: "Middle", prefix: "MID", tasks: 250 },
	{ id: "small", name: "Small", prefix: "SML", tasks: 45 },
];

const STALE = "2025-01-01T00:00:00.000Z";
const FRESH = "2026-10-01T00:00:00.000Z";
const PAGE = 100;
const SMALL_TASKS = PROJECTS.find((project) => project.id === "small")!.tasks;

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

function statusAt(index: number): Status {
	if (index % 10 === 0) return "done";
	if (index % 17 === 0) return "cancelled";
	if (index % 7 === 0) return "blocked";
	if (index % 5 === 0) return "in-progress";
	return "open";
}

function totals() {
	const counts: Record<string, number> = {};

	for (const project of PROJECTS) {
		for (let index = 1; index <= project.tasks; index += 1) {
			const status = statusAt(index);
			counts[status] = (counts[status] ?? 0) + 1;
		}
	}

	const active = PROJECTS.reduce((sum, project) => sum + project.tasks, 0);

	return { counts, active };
}

async function seed(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");

	for (const project of PROJECTS) {
		unwrap(
			createProject(db, {
				id: project.id,
				name: project.name,
				prefix: project.prefix,
			}),
		);

		for (let index = 1; index <= project.tasks; index += 1) {
			unwrap(
				createTask(db, {
					project_id: project.id,
					title: `Volume ${project.prefix}-${index}`,
					status: statusAt(index),
				}),
			);
		}

		const stamp = project.id === "small" ? STALE : FRESH;

		// NOTE: the big project gets one timestamp for all rows so the id
		// tiebreaker in the default ORDER BY is exercised on every page.
		db.prepare(
			"UPDATE tasks SET updated_at = ?, created_at = ? WHERE project_id = ?",
		).run(stamp, stamp, project.id);
	}

	return db;
}

describe("volume smoke", () => {
	let db: DatabaseSync;
	let counts: Record<string, number>;
	let active: number;

	beforeAll(async () => {
		db = await seed();
		({ counts, active } = totals());
	}, 120_000);

	it("walks every page without repeats or holes", () => {
		const seen = new Set<string>();
		const query = { sort: "updated_at" as const, order: "desc" as const };

		for (let offset = 0; ; offset += PAGE) {
			const page = listTasks(db, { ...query, limit: PAGE, offset });
			if (page.length === 0) break;

			for (const task of page) {
				expect(seen.has(task.id)).toBe(false);
				seen.add(task.id);
			}
		}

		expect(seen.size).toBe(PROJECTS.reduce((sum, p) => sum + p.tasks, 0));
		expect(countTasks(db, query)).toBe(seen.size);
	});

	it("finds a stale task that is not on the first page", () => {
		const [target] = listTasks(db, {
			project_id: "small",
			sort: "number",
			order: "asc",
			limit: 1,
		});
		expect(target).toBeDefined();
		if (target === undefined) return;

		const firstPage = listTasks(db, {
			sort: "updated_at",
			order: "desc",
			limit: PAGE,
		});
		expect(firstPage.some((task) => task.id === target.id)).toBe(false);

		const byId = listTasks(db, { id_exact: [target.id] });
		expect(byId.map((task) => task.id)).toContain(target.id);

		const byNumber = listTasks(db, {
			number_exact: [target.number],
			project_id: "small",
		});
		expect(byNumber.map((task) => task.id)).toContain(target.id);

		const byText = listTasks(db, { q_any: ["SML"] });
		expect(byText.map((task) => task.id)).toContain(target.id);
		expect(byText.length).toBe(SMALL_TASKS);
	});

	it("gives a project without fresh tasks its own rows", () => {
		const page = listTasks(db, { project_id: "small", limit: PAGE });
		const query = { project_id: "small" };

		expect(page.length).toBe(SMALL_TASKS);
		expect(page.every((task) => task.project_id === "small")).toBe(true);
		expect(countTasks(db, query)).toBe(SMALL_TASKS);
	});

	it("keeps the counters equal to the stored rows", () => {
		const stored = countTasksByStatus(db);
		const sum = Object.values(stored).reduce(
			(total, value) => total + value,
			0,
		);

		expect(sum).toBe(PROJECTS.reduce((acc, p) => acc + p.tasks, 0));
		expect(stored).toMatchObject(counts);

		for (const project of PROJECTS) {
			const scoped = countTasksByStatus(db, project.id);
			const scopedSum = Object.values(scoped).reduce(
				(total, value) => total + value,
				0,
			);
			expect(scopedSum).toBe(project.tasks);
		}
	});

	it("hides the closed tasks until a closed status is asked for", () => {
		const hidden = listTasks(db, {
			status: ["open", "in-progress", "blocked"],
		});
		const closed = listTasks(db, { status: ["done", "cancelled"] });

		expect(hidden.every((task) => task.closed_at === null)).toBe(true);
		expect(hidden.length).toBe(
			active - (counts["done"] ?? 0) - (counts["cancelled"] ?? 0),
		);
		expect(closed.length).toBe(
			(counts["done"] ?? 0) + (counts["cancelled"] ?? 0),
		);
	});
});
