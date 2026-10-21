import { describe, expect, it } from "vitest";
import { defaultOrderFor, sortTasks } from "./sort";
import type { Task } from "#lib/types.ts";

function task(overrides: Partial<Task>): Task {
	return {
		id: "X-1",
		project_id: "inbox",
		number: 1,
		title: "task",
		description: "",
		status: "open",
		priority: "medium",
		is_epic: false,
		epic_id: null,
		scope_id: null,
		source_file: null,
		estimate: null,
		tags: [],
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		closed_at: null,
		closed_reason: null,
		deleted_at: null,
		...overrides,
	};
}

const tasks = [
	task({ id: "X-1", priority: "low", number: 1 }),
	task({ id: "X-2", priority: "critical", number: 2 }),
	task({ id: "X-3", priority: "high", number: 3 }),
	task({ id: "X-4", priority: "medium", number: 4 }),
];

describe("sortTasks", () => {
	it("puts critical first when sorting priority ascending", () => {
		const sorted = sortTasks(tasks, "priority", "asc");

		expect(sorted.map((item) => item.priority)).toEqual([
			"critical",
			"high",
			"medium",
			"low",
		]);
	});

	it("reverses priority when sorting descending", () => {
		const sorted = sortTasks(tasks, "priority", "desc");

		expect(sorted.map((item) => item.priority)).toEqual([
			"low",
			"medium",
			"high",
			"critical",
		]);
	});

	it("orders tasks by status workflow", () => {
		const sorted = sortTasks(
			[
				task({ id: "X-1", status: "cancelled" }),
				task({ id: "X-2", status: "open" }),
				task({ id: "X-3", status: "blocked" }),
				task({ id: "X-4", status: "in-progress" }),
			],
			"status",
			"asc",
		);

		expect(sorted.map((item) => item.status)).toEqual([
			"open",
			"in-progress",
			"blocked",
			"cancelled",
		]);
	});

	it("orders id numerically, not lexically", () => {
		const sorted = sortTasks(
			[
				task({ id: "INB-10", number: 10 }),
				task({ id: "INB-2", number: 2 }),
				task({ id: "INB-9", number: 9 }),
			],
			"id",
			"asc",
		);

		expect(sorted.map((item) => item.id)).toEqual(["INB-2", "INB-9", "INB-10"]);
	});

	it("breaks priority ties by most recently updated", () => {
		const sorted = sortTasks(
			[
				task({
					id: "X-1",
					priority: "high",
					updated_at: "2026-01-01T00:00:00.000Z",
				}),
				task({
					id: "X-2",
					priority: "high",
					updated_at: "2026-01-03T00:00:00.000Z",
				}),
				task({
					id: "X-3",
					priority: "high",
					updated_at: "2026-01-02T00:00:00.000Z",
				}),
			],
			"priority",
			"asc",
		);

		expect(sorted.map((item) => item.id)).toEqual(["X-2", "X-3", "X-1"]);
	});

	it("does not mutate the input array", () => {
		const input = [...tasks];
		sortTasks(input, "priority", "asc");

		expect(input.map((item) => item.id)).toEqual(["X-1", "X-2", "X-3", "X-4"]);
	});
});

describe("defaultOrderFor", () => {
	it("defaults priority and status to ascending and the rest to descending", () => {
		expect(defaultOrderFor("priority")).toBe("asc");
		expect(defaultOrderFor("status")).toBe("asc");
		expect(defaultOrderFor("created")).toBe("desc");
		expect(defaultOrderFor("updated")).toBe("desc");
		expect(defaultOrderFor("id")).toBe("desc");
	});
});
