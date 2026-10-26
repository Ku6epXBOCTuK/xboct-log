import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "#lib/types.ts";

const getTasksByIds = vi.fn();
const updateTask = vi.fn();
const deleteTask = vi.fn();
const createTask = vi.fn();

vi.mock("#lib/remote/tasks.remote.ts", () => ({
	getTasksByIds: (input: { ids: string[] }) => getTasksByIds(input),
	updateTask: (input: { id: string; patch: { title?: string } }) =>
		updateTask(input),
	deleteTask: (input: { id: string }) => deleteTask(input),
	createTask: (input: unknown) => createTask(input),
	moveTask: vi.fn(),
	closeTask: vi.fn(),
}));

vi.mock("#lib/remote/blockers.remote.ts", () => ({
	addBlocker: vi.fn(),
	removeBlocker: vi.fn(),
}));

vi.mock("#lib/remote/links.remote.ts", () => ({
	addLink: vi.fn(),
	removeLink: vi.fn(),
}));

const { createTaskStore } = await import("./tasks.svelte.ts");

function task(id: string, extra: Partial<Task> = {}): Task {
	return {
		id,
		project_id: "spa",
		number: Number(id.split("-")[1]),
		title: id,
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
		blocked_by: [],
		blocks: [],
		...extra,
	};
}

const snapshot = [task("SPA-1")];

describe("task store", () => {
	beforeEach(() => {
		getTasksByIds.mockReset();
		updateTask.mockReset();
		deleteTask.mockReset();
		createTask.mockReset();
	});

	it("resolves snapshot tasks by id", () => {
		const store = createTaskStore(snapshot);

		expect(store.byId("SPA-1")?.title).toBe("SPA-1");
		expect(store.byId("SPA-9")).toBeUndefined();
		expect(store.isAbsent("SPA-9")).toBe(false);
	});

	it("reports a truncated snapshot when the server total is larger", () => {
		const store = createTaskStore(snapshot, 40);

		expect(store.total).toBe(40);
		expect(store.truncated).toBe(true);

		store.replaceAll(snapshot);

		expect(store.total).toBe(1);
		expect(store.truncated).toBe(false);
	});

	it("follows the server total through a live reload", () => {
		const store = createTaskStore(snapshot, 1);

		store.replaceAll([task("SPA-1"), task("SPA-2")], 1200);

		expect(store.total).toBe(1200);
		expect(store.truncated).toBe(true);
	});

	it("keeps total in step with create and delete", async () => {
		const store = createTaskStore(snapshot, 1);
		const created = task("SPA-2");
		vi.mocked(createTask).mockResolvedValue(created);

		await store.create({ project_id: "spa", title: "SPA-2" });
		expect(store.total).toBe(2);

		deleteTask.mockResolvedValue({ id: "SPA-2" });
		await store.destroy("SPA-2");
		expect(store.total).toBe(1);
	});

	it("pins a task that is outside the snapshot", async () => {
		const store = createTaskStore(snapshot);
		getTasksByIds.mockResolvedValue({
			items: [task("SPA-9", { title: "outside" })],
			missing: [],
		});

		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledWith({ ids: ["SPA-9"] });
		expect(store.byId("SPA-9")?.title).toBe("outside");
		expect(store.tasks.map((item) => item.id)).toEqual(["SPA-1"]);
	});

	it("does not request a pinned task twice", async () => {
		const store = createTaskStore(snapshot);
		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });

		await store.pin(["SPA-9"]);
		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledTimes(1);
	});

	it("remembers ids the server reports as missing", async () => {
		const store = createTaskStore(snapshot);
		getTasksByIds.mockResolvedValue({ items: [], missing: ["SPA-9"] });

		await store.pin(["SPA-9"]);

		expect(store.isAbsent("SPA-9")).toBe(true);

		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledTimes(1);
	});

	it("marks a failed request as failed, not as missing", async () => {
		const store = createTaskStore(snapshot);
		getTasksByIds.mockRejectedValue(new Error("offline"));

		await store.pin(["SPA-9"]);

		expect(store.isFailed("SPA-9")).toBe(true);
		expect(store.isAbsent("SPA-9")).toBe(false);

		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledTimes(1);

		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });
		store.replaceAll(snapshot);

		expect(store.isFailed("SPA-9")).toBe(false);
	});

	it("keeps pinned tasks that are still outside a new snapshot", () => {
		const store = createTaskStore(snapshot);
		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });

		return store.pin(["SPA-9"]).then(() => {
			store.replaceAll([task("SPA-1", { title: "renamed" })]);

			expect(store.byId("SPA-9")?.id).toBe("SPA-9");
			expect(store.byId("SPA-1")?.title).toBe("renamed");
		});
	});

	it("saves a pinned task in place instead of dropping it", async () => {
		const store = createTaskStore(snapshot);
		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });
		await store.pin(["SPA-9"]);
		updateTask.mockResolvedValue(task("SPA-9", { title: "edited" }));

		await store.save("SPA-9", { title: "edited" });

		expect(store.byId("SPA-9")?.title).toBe("edited");
		expect(store.tasks.map((item) => item.id)).toEqual(["SPA-1"]);
	});
});
