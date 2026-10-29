import { describe, expect, it } from "vitest";
import { STATUSES, type Task } from "#lib/types.ts";
import {
	activeCount,
	emptyCounts,
	epicActive,
	projectActive,
	projectCounts,
	projectTotal,
	scopeActive,
	scopeTotal,
	summarize,
	totalCount,
} from "./counts.ts";

const counts = { open: 2, "in-progress": 1, blocked: 3, done: 4, cancelled: 5 };

describe("counts", () => {
	it("starts every status at zero", () => {
		const empty = emptyCounts();

		expect(Object.keys(empty).sort()).toEqual([...STATUSES].sort());
		expect(Object.values(empty).every((value) => value === 0)).toBe(true);
	});

	it("sums only the statuses that are still active", () => {
		expect(activeCount(counts)).toBe(6);
		expect(totalCount(counts)).toBe(15);
	});

	it("leaves the backlog out of the active count", () => {
		expect(activeCount({ backlog: 12, open: 2 })).toBe(2);
		expect(totalCount({ backlog: 12, open: 2 })).toBe(14);
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

	it("splits the project counters into backlog, active and blocked", () => {
		const project = {
			id: "spa",
			name: "SPA",
			prefix: "SPA",
			repo: null,
			created_at: "2026-01-01T00:00:00.000Z",
			archived_at: null,
			task_counts: { ...counts, backlog: 3 },
			epic_counts: { open: 2, blocked: 1, done: 1, total: 4 },
		};

		expect(projectCounts(project)).toEqual({
			backlog: 3,
			active: 5,
			blocked: 4,
			complete: 5,
		});
	});

	it("treats a project without counters as empty", () => {
		const project = {
			id: "spa",
			name: "SPA",
			prefix: "SPA",
			repo: null,
			created_at: "2026-01-01T00:00:00.000Z",
			archived_at: null,
		};

		expect(projectCounts(project)).toEqual({
			backlog: 0,
			active: 0,
			blocked: 0,
			complete: 0,
		});
		expect(summarize(undefined, [])).toEqual({
			backlog: 0,
			active: 0,
			blocked: 0,
			complete: 0,
		});
	});

	it("summarizes the whole tracker together with its epics", () => {
		const epics = [
			{ status: "backlog" },
			{ status: "open" },
			{ status: "blocked" },
		] as Task[];

		expect(summarize({ open: 3, "in-progress": 2, blocked: 1 }, epics)).toEqual(
			{ backlog: 1, active: 6, blocked: 2, complete: 0 },
		);
	});

	it("counts the open epics of the whole tracker", () => {
		const epics = [
			{ status: "backlog" },
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
