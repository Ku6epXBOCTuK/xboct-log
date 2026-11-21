import { beforeEach, describe, expect, it, vi } from "vitest";

const getTask = vi.fn();

vi.mock("#lib/api/tasks.ts", () => ({
	getTask: (input: { task_id: string }) => getTask(input),
}));

const { createEpicProgress } = await import("./epic-progress.svelte.ts");

describe("epic progress store", () => {
	beforeEach(() => {
		getTask.mockReset();
	});

	it("loads fresh counts from the task endpoint", async () => {
		getTask.mockResolvedValue({
			id: "E-1",
			children_counts: { open: 0, done: 4, total: 4 },
		});
		const store = createEpicProgress();

		expect(store.of("E-1")).toBeNull();

		store.load("E-1");
		await vi.waitFor(() =>
			expect(store.of("E-1")).toEqual({ closed: 4, total: 4 }),
		);

		expect(getTask).toHaveBeenCalledWith({ task_id: "E-1" });
	});

	it("keeps each epic separate when the panel switches tasks", async () => {
		getTask.mockImplementation((input: { task_id: string }) =>
			Promise.resolve({
				id: input.task_id,
				children_counts:
					input.task_id === "E-1"
						? { done: 4, total: 4 }
						: { done: 1, total: 2 },
			}),
		);
		const store = createEpicProgress();

		store.load("E-1");
		store.load("E-2");
		await vi.waitFor(() => {
			expect(store.of("E-1")).toEqual({ closed: 4, total: 4 });
			expect(store.of("E-2")).toEqual({ closed: 1, total: 2 });
		});
	});

	it("reloads tracked epics on refresh", async () => {
		getTask.mockResolvedValueOnce({
			id: "E-1",
			children_counts: { done: 3, total: 7 },
		});
		const store = createEpicProgress();
		store.load("E-1");
		await vi.waitFor(() => expect(store.of("E-1")).toBeDefined());

		getTask.mockResolvedValueOnce({
			id: "E-1",
			children_counts: { done: 4, total: 4 },
		});
		await store.refresh();

		expect(store.of("E-1")).toEqual({ closed: 4, total: 4 });
	});

	it("deduplicates concurrent loads of the same epic", async () => {
		getTask.mockResolvedValue({
			id: "E-1",
			children_counts: { done: 4, total: 4 },
		});
		const store = createEpicProgress();

		store.load("E-1");
		store.load("E-1");
		await vi.waitFor(() => expect(store.of("E-1")).toBeDefined());

		expect(getTask).toHaveBeenCalledTimes(1);
	});

	it("retries an epic whose first load failed", async () => {
		getTask.mockRejectedValueOnce(new Error("offline"));
		const store = createEpicProgress();
		store.load("E-1");
		await vi.waitFor(() => expect(getTask).toHaveBeenCalledTimes(1));
		expect(store.of("E-1")).toBeNull();

		getTask.mockResolvedValueOnce({
			id: "E-1",
			children_counts: { done: 4, total: 4 },
		});
		await store.refresh();

		expect(store.of("E-1")).toEqual({ closed: 4, total: 4 });
	});
});
