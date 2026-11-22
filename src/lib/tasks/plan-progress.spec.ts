import { describe, expect, it } from "vitest";
import type { Task } from "#lib/types.ts";
import { planProgress } from "./plan-progress";

function task(overrides: Partial<Task>): Task {
	return {
		plan_ids: [],
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
		assignee: null,
		due_at: null,
		tags: [],
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		closed_at: null,
		closed_reason: null,
		blocked_reason: null,
		deleted_at: null,
		...overrides,
	};
}

describe("planProgress", () => {
	it("counts done and cancelled non-epic tasks", () => {
		expect(
			planProgress([
				task({ id: "X-1", status: "done" }),
				task({ id: "X-2", status: "cancelled" }),
				task({ id: "X-3", status: "open" }),
				task({ id: "X-4", status: "in-progress" }),
			]),
		).toEqual({ closed: 2, total: 4 });
	});

	it("ignores deleted tasks and epics", () => {
		expect(
			planProgress([
				task({ id: "X-1", status: "done" }),
				task({ id: "X-2", status: "done", deleted_at: "2026-01-02" }),
				task({ id: "E-1", status: "done", is_epic: true }),
			]),
		).toEqual({ closed: 1, total: 1 });
	});

	it("reports an empty plan", () => {
		expect(planProgress([])).toEqual({ closed: 0, total: 0 });
	});
});
