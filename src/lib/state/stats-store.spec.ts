import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "#lib/types.ts";

const getTaskStats = vi.fn();

vi.mock("#lib/remote/stats.remote.ts", () => ({
	getTaskStats: (input: unknown) => getTaskStats(input),
}));

vi.mock("#lib/remote/fresh.ts", () => ({
	fetchFresh: (value: unknown) => value,
}));

const { createStatsStore } = await import("./stats.svelte.ts");

function epic(id: string, counts: Record<string, number>): Task {
	return {
		id,
		project_id: "spa",
		number: 1,
		title: id,
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

const stats = {
	tasks: { open: 3, "in-progress": 2, blocked: 1, done: 9, cancelled: 4 },
	epics: [epic("SPA-1", { open: 1, done: 2, total: 3 })],
};

describe("stats store", () => {
	beforeEach(() => {
		getTaskStats.mockReset();
	});

	it("starts empty until the first load", () => {
		const store = createStatsStore();

		expect(store.activeTasks).toBe(0);
		expect(store.summary).toEqual({
			backlog: 0,
			active: 0,
			blocked: 0,
			complete: 0,
		});
		expect(store.inProgress).toBe(0);
		expect(store.epics).toEqual([]);
	});

	it("counts active tasks together with the open epics", async () => {
		const store = createStatsStore();
		getTaskStats.mockResolvedValue(stats);

		await store.load();

		expect(store.activeTasks).toBe(7);
		expect(store.summary).toEqual({
			backlog: 0,
			active: 6,
			blocked: 1,
			complete: 9,
		});
		expect(store.inProgress).toBe(2);
		expect(store.epics.map((item) => item.id)).toEqual(["SPA-1"]);
		expect(store.epics[0]?.children_counts).toEqual({
			open: 1,
			done: 2,
			total: 3,
		});
	});

	it("ignores a response that a newer request overtook", async () => {
		const store = createStatsStore();
		let resolveSlow: (value: unknown) => void = () => {};
		getTaskStats
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveSlow = resolve;
					}),
			)
			.mockResolvedValueOnce({
				tasks: { open: 1 },
				epics: [],
			});

		const slow = store.load();
		await store.load();
		resolveSlow(stats);
		await slow;

		expect(store.activeTasks).toBe(1);
	});

	it("keeps the previous numbers when a reload fails", async () => {
		const store = createStatsStore();
		getTaskStats.mockResolvedValueOnce(stats);
		await store.load();
		getTaskStats.mockRejectedValueOnce(new Error("offline"));

		await store.refresh();

		expect(store.activeTasks).toBe(7);
	});
});
