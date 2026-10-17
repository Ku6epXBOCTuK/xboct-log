import { describe, expect, it } from "vitest";
import { filterTasks, type FilterCriteria } from "./filter";
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
		source_line: null,
		tags: [],
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		closed_at: null,
		closed_reason: null,
		deleted_at: null,
		...overrides,
	};
}

function criteria(overrides: Partial<FilterCriteria> = {}): FilterCriteria {
	return {
		activeProject: "all",
		status: "all",
		priority: "all",
		hideClosed: true,
		epic: "any",
		scope: "any",
		selectedTags: [],
		query: "",
		...overrides,
	};
}

const tasks = [
	task({ id: "X-1", status: "open" }),
	task({ id: "X-2", status: "in-progress" }),
	task({
		id: "X-3",
		status: "done",
		closed_at: "2026-01-02T00:00:00.000Z",
		closed_reason: "fixed",
	}),
	task({
		id: "X-4",
		status: "cancelled",
		closed_at: "2026-01-02T00:00:00.000Z",
		closed_reason: "obsolete",
	}),
];

describe("hideClosed", () => {
	it("drops done and cancelled tasks", () => {
		const visible = filterTasks(tasks, criteria());

		expect(visible.map((item) => item.id)).toEqual(["X-1", "X-2"]);
	});

	it("keeps closed tasks when turned off", () => {
		const visible = filterTasks(tasks, criteria({ hideClosed: false }));

		expect(visible.map((item) => item.id)).toEqual([
			"X-1",
			"X-2",
			"X-3",
			"X-4",
		]);
	});

	it("drops closed tasks even when a closed status is selected", () => {
		const visible = filterTasks(tasks, criteria({ status: "done" }));

		expect(visible).toEqual([]);
	});

	it("combines with the other criteria", () => {
		const visible = filterTasks(
			tasks,
			criteria({ status: "in-progress", priority: "medium" }),
		);

		expect(visible.map((item) => item.id)).toEqual(["X-2"]);
	});
});
