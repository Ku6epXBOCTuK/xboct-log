import { describe, expect, it } from "vitest";
import {
	collectEpicProgress,
	countActiveTasksInProject,
	filterTasks,
	type FilterCriteria,
} from "./filter";
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
		activeProject: null,
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

describe("query", () => {
	it("matches a task by its epic id", () => {
		const visible = filterTasks(
			[task({ id: "X-1", epic_id: "LOG-26" })],
			criteria({ query: "26" }),
		);

		expect(visible.map((item) => item.id)).toEqual(["X-1"]);
	});

	it("keeps tasks of other epics out", () => {
		const visible = filterTasks(
			[
				task({ id: "X-1", epic_id: "LOG-26" }),
				task({ id: "X-2", epic_id: "LOG-9" }),
			],
			criteria({ query: "26" }),
		);

		expect(visible.map((item) => item.id)).toEqual(["X-1"]);
	});
});

describe("countActiveTasksInProject", () => {
	it("counts only non-closed tasks in the project", () => {
		const projectTasks = [
			task({ id: "P-1", project_id: "proj-1", status: "open" }),
			task({ id: "P-2", project_id: "proj-1", status: "in-progress" }),
			task({ id: "P-3", project_id: "proj-1", status: "blocked" }),
			task({ id: "P-4", project_id: "proj-1", status: "done" }),
			task({ id: "P-5", project_id: "proj-1", status: "cancelled" }),
			task({ id: "P-6", project_id: "proj-2", status: "open" }),
		];

		expect(countActiveTasksInProject(projectTasks, "proj-1")).toBe(3);
		expect(countActiveTasksInProject(projectTasks, "proj-2")).toBe(1);
		expect(countActiveTasksInProject(projectTasks, "proj-3")).toBe(0);
	});
});

describe("collectEpicProgress", () => {
	it("counts children and closed children per epic", () => {
		const progress = collectEpicProgress([
			task({ id: "E-1", is_epic: true }),
			task({ id: "A-1", epic_id: "E-1" }),
			task({ id: "A-2", epic_id: "E-1", status: "done" }),
			task({ id: "A-3", epic_id: "E-1", status: "in-progress" }),
		]);

		expect(progress.get("E-1")).toEqual({ closed: 1, total: 3 });
	});

	it("counts cancelled children as closed", () => {
		const progress = collectEpicProgress([
			task({ id: "E-1", is_epic: true }),
			task({ id: "A-1", epic_id: "E-1", status: "done" }),
			task({ id: "A-2", epic_id: "E-1", status: "cancelled" }),
		]);

		expect(progress.get("E-1")).toEqual({ closed: 2, total: 2 });
	});

	it("ignores tasks without an epic", () => {
		const progress = collectEpicProgress([task({ id: "X-1" })]);

		expect(progress.size).toBe(0);
	});

	it("has no entry for an epic without children", () => {
		const progress = collectEpicProgress([task({ id: "E-1", is_epic: true })]);

		expect(progress.get("E-1")).toBeUndefined();
	});
});
