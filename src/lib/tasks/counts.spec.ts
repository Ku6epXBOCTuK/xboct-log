import { describe, expect, it } from "vitest";
import type { Task } from "#lib/types.ts";
import {
	activeCount,
	emptyCounts,
	epicActive,
	projectActive,
	projectTotal,
	scopeActive,
	scopeTotal,
	totalCount,
} from "./counts.ts";

const counts = { open: 2, "in-progress": 1, blocked: 3, done: 4, cancelled: 5 };

describe("counts", () => {
	it("starts every status at zero", () => {
		expect(emptyCounts()).toEqual({
			open: 0,
			"in-progress": 0,
			blocked: 0,
			done: 0,
			cancelled: 0,
		});
	});

	it("sums only the statuses that are still active", () => {
		expect(activeCount(counts)).toBe(6);
		expect(totalCount(counts)).toBe(15);
	});

	it("treats missing counts as zero", () => {
		expect(activeCount(undefined)).toBe(0);
		expect(totalCount(undefined)).toBe(0);
	});

	it("ignores the extra total key that epic counters carry", () => {
		const withTotal = { open: 1, done: 2, total: 3 };

		expect(activeCount(withTotal)).toBe(1);
		expect(totalCount(withTotal)).toBe(3);
	});

	it("reads project counters from the server snapshot", () => {
		const project = {
			id: "spa",
			name: "SPA",
			prefix: "SPA",
			repo: null,
			created_at: "2026-01-01T00:00:00.000Z",
			archived_at: null,
			task_counts: counts,
			epic_counts: { open: 2, done: 1 },
		};

		expect(projectActive(project)).toBe(8);
		expect(projectTotal(project)).toBe(18);
		expect(projectActive({ ...project, task_counts: undefined })).toBe(2);
	});

	it("counts the open epics of the whole tracker", () => {
		const epics = [
			{ status: "open" },
			{ status: "in-progress" },
			{ status: "done" },
			{ status: "cancelled" },
		] as Task[];

		expect(epicActive(epics)).toBe(2);
		expect(epicActive([])).toBe(0);
	});

	it("falls back to the active count when a scope has no total", () => {
		const scope = {
			id: 1,
			project_id: "spa",
			name: "UI",
			created_at: "2026-01-01T00:00:00.000Z",
			task_count: 4,
		};

		expect(scopeActive(scope)).toBe(4);
		expect(scopeTotal(scope)).toBe(4);
		expect(scopeTotal({ ...scope, tasks_total: 12 })).toBe(12);
		expect(scopeActive({ ...scope, task_count: undefined })).toBe(0);
	});
});
