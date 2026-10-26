import { describe, expect, it } from "vitest";
import { collectEpicProgress } from "./filter";
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
});
