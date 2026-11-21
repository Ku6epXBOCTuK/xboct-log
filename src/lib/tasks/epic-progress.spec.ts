import { describe, expect, it } from "vitest";
import type { Task } from "#lib/types.ts";
import { epicProgress, openChildren } from "./epic-progress.ts";

function epic(counts?: Record<string, number>): Task {
	return {
		plan_ids: [],
		id: "E-1",
		project_id: "inbox",
		number: 1,
		title: "epic",
		description: "",
		status: "open",
		priority: "medium",
		is_epic: true,
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
		children_counts: counts,
	};
}

describe("epicProgress", () => {
	it("returns null without server counts", () => {
		expect(epicProgress(undefined)).toBeNull();
		expect(epicProgress(null)).toBeNull();
	});

	it("counts cancelled children as closed", () => {
		expect(epicProgress({ done: 3, cancelled: 1, open: 2, total: 6 })).toEqual({
			closed: 4,
			total: 6,
		});
	});

	it("uses the server total even when it is zero", () => {
		expect(epicProgress({})).toEqual({ closed: 0, total: 0 });
	});

	it("ignores unknown status counts", () => {
		expect(epicProgress({ done: 1, done_old: 5, total: 2 })).toEqual({
			closed: 1,
			total: 2,
		});
	});
});

describe("openChildren", () => {
	it("subtracts closed children from the server total", () => {
		expect(openChildren(epic({ done: 4, cancelled: 1, total: 5 }))).toBe(0);
		expect(openChildren(epic({ done: 2, total: 5 }))).toBe(3);
	});

	it("returns zero without server counts", () => {
		expect(openChildren(epic())).toBe(0);
	});
});
