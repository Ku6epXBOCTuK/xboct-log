import { describe, expect, it } from "vitest";
import { collectEpicProgress, collectTags } from "./filter";
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

describe("active counts of tags", () => {
	const grouped = [
		task({ id: "X-1", epic_id: "E-1", scope_id: 1, tags: ["a"] }),
		task({ id: "X-2", epic_id: "E-1", scope_id: 1, tags: ["a", "b"] }),
		task({
			id: "X-3",
			status: "done",
			epic_id: "E-1",
			scope_id: 1,
			tags: ["a"],
		}),
		task({
			id: "X-4",
			status: "cancelled",
			epic_id: "E-2",
			scope_id: 2,
			tags: ["b"],
		}),
	];

	it("counts the open and the total tasks of a tag", () => {
		expect(collectTags(grouped)).toEqual([
			{ tag: "a", count: 3, active: 2 },
			{ tag: "b", count: 2, active: 1 },
		]);
	});

	it("collects the tags of the current project only", () => {
		const scoped = [
			task({ id: "P-1", project_id: "proj-1", tags: ["a"] }),
			task({
				id: "P-2",
				project_id: "proj-1",
				status: "done",
				tags: ["a", "b"],
			}),
			task({ id: "P-3", project_id: "proj-2", tags: ["b", "c"] }),
		];

		expect(collectTags(scoped, "proj-1")).toEqual([
			{ tag: "a", count: 2, active: 1 },
			{ tag: "b", count: 1, active: 0 },
		]);
	});

	it("sorts the tags without active tasks to the end", () => {
		const scoped = [
			task({ id: "P-1", tags: ["zeta"] }),
			task({ id: "P-2", status: "done", tags: ["beta", "alpha"] }),
			task({ id: "P-3", tags: ["alpha"] }),
		];

		expect(collectTags(scoped).map((entry) => entry.tag)).toEqual([
			"alpha",
			"zeta",
			"beta",
		]);
	});

	it("keeps a selected tag that has no tasks in the project", () => {
		const scoped = [
			task({ id: "P-1", project_id: "proj-1", tags: ["a"] }),
			task({ id: "P-2", project_id: "proj-2", tags: ["z"] }),
		];

		expect(collectTags(scoped, "proj-1", ["z"])).toEqual([
			{ tag: "a", count: 1, active: 1 },
			{ tag: "z", count: 0, active: 0 },
		]);
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
