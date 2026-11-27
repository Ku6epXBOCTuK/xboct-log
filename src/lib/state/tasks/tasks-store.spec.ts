import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskQueryArgs } from "#lib/tasks/query/query.ts";
import type { Task } from "#lib/types.ts";

const getTasks = vi.fn();
const getTasksByIds = vi.fn();
const updateTask = vi.fn();
const deleteTask = vi.fn();
const createTask = vi.fn();

vi.mock("#lib/api/tasks/tasks.ts", () => ({
	getTasks: (input: unknown) => getTasks(input),
	getTasksByIds: (input: { task_ids: string[] }) => getTasksByIds(input),
	updateTask: (input: unknown) => updateTask(input),
	deleteTask: (input: { task_id: string }) => deleteTask(input),
	createTask: (input: unknown) => createTask(input),
	moveTask: vi.fn(),
	closeTask: vi.fn(),
}));

vi.mock("#lib/api/fresh.ts", () => ({
	fetchFresh: (query: unknown) => query,
}));

vi.mock("#lib/api/tasks/links.ts", () => ({
	addBlocker: vi.fn(),
	removeBlocker: vi.fn(),
}));

vi.mock("#lib/api/tasks/links.ts", () => ({
	addLink: vi.fn(),
	removeLink: vi.fn(),
}));

const { createTaskStore } = await import("#lib/state/tasks/tasks.svelte.ts");

function task(id: string, extra: Partial<Task> = {}): Task {
	return {
		plan_ids: [],
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

function page(number = 1): TaskQueryArgs {
	return {
		sort: "updated_at",
		order: "desc",
		page: number,
	};
}

function pageResult(items: Task[], total: number) {
	return { items, total, offset: 0, size: items.length, page_size: 20 };
}

const first = [task("SPA-1")];

describe("task store", () => {
	beforeEach(() => {
		getTasks.mockReset();
		getTasksByIds.mockReset();
		updateTask.mockReset();
		deleteTask.mockReset();
		createTask.mockReset();
	});

	it("loads a page and reports the server total", async () => {
		const store = createTaskStore();
		getTasks.mockResolvedValue(pageResult(first, 120));

		await store.load(page());

		expect(getTasks).toHaveBeenCalledWith(page());
		expect(store.tasks.map((item) => item.id)).toEqual(["SPA-1"]);
		expect(store.total).toBe(120);
		expect(store.pages).toBe(6);
		expect(store.loading).toBe(false);
		expect(store.error).toBeNull();
	});

	it("takes the offset, size and page size from the server response", async () => {
		const store = createTaskStore();
		getTasks.mockResolvedValue({
			items: first,
			total: 74,
			offset: 0,
			size: 1,
			page_size: 50,
		});

		await store.load(page());

		expect(store.offset).toBe(0);
		expect(store.size).toBe(1);
		expect(store.pageSize).toBe(50);
		expect(store.pages).toBe(2);
	});

	it("ignores a response overtaken by a newer request", async () => {
		const store = createTaskStore();
		let resolveSlow: (value: unknown) => void = () => {};
		getTasks.mockImplementationOnce(
			() => new Promise((resolve) => (resolveSlow = resolve)),
		);
		getTasks.mockResolvedValueOnce(pageResult([task("SPA-2")], 2));

		const slow = store.load(page(1));
		await store.load(page(2));
		resolveSlow(pageResult([task("SPA-9")], 999));
		await slow;

		expect(store.tasks.map((item) => item.id)).toEqual(["SPA-2"]);
		expect(store.total).toBe(2);
	});

	it("keeps the page and reports the error when a load fails", async () => {
		const store = createTaskStore(first, 1);
		getTasks.mockRejectedValueOnce(new Error("offline"));

		await store.load(page());

		expect(store.error).toBe("offline");
		expect(store.loading).toBe(false);
		expect(store.tasks.map((item) => item.id)).toEqual(["SPA-1"]);
	});

	it("repeats the last query on refresh", async () => {
		const store = createTaskStore();
		getTasks.mockResolvedValue(pageResult(first, 1));

		await store.load(page(2));
		await store.refresh();

		expect(getTasks).toHaveBeenCalledTimes(2);
		expect(getTasks).toHaveBeenNthCalledWith(2, page(2));
	});

	it("follows the server total through a live refresh", async () => {
		const store = createTaskStore();
		getTasks.mockResolvedValueOnce(pageResult(first, 1));
		await store.load(page());

		getTasks.mockResolvedValueOnce(pageResult(first, 1200));
		await store.refresh();

		expect(store.total).toBe(1200);
		expect(store.pages).toBe(60);
	});

	it("keeps total in step with create and delete", async () => {
		const store = createTaskStore();
		getTasks.mockResolvedValueOnce(pageResult(first, 1));
		await store.load(page());

		const created = task("SPA-2");
		createTask.mockResolvedValue(created);
		getTasks.mockResolvedValueOnce(pageResult([...first, created], 2));

		await store.create({ project_id: "spa", title: "SPA-2" });
		expect(store.total).toBe(2);
		expect(store.byId("SPA-2")?.title).toBe("SPA-2");

		deleteTask.mockResolvedValue({ id: "SPA-2" });
		await store.destroy("SPA-2");
		expect(store.total).toBe(1);
		expect(store.byId("SPA-2")).toBeUndefined();
	});

	it("pins a task that is outside the page", async () => {
		const store = createTaskStore(first, 1);
		getTasksByIds.mockResolvedValue({
			items: [task("SPA-9", { title: "outside" })],
			missing: [],
		});

		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledWith({ task_ids: ["SPA-9"] });
		expect(store.byId("SPA-9")?.title).toBe("outside");
		expect(store.tasks.map((item) => item.id)).toEqual(["SPA-1"]);
	});

	it("does not request a pinned task twice", async () => {
		const store = createTaskStore(first, 1);
		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });

		await store.pin(["SPA-9"]);
		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledTimes(1);
	});

	it("hydrates a task that came from the list without its description", async () => {
		const store = createTaskStore(first, 1);
		getTasksByIds.mockResolvedValue({
			items: [task("SPA-1", { description: "full text" })],
			missing: [],
		});

		await store.pin(["SPA-1"]);

		expect(getTasksByIds).toHaveBeenCalledWith({ task_ids: ["SPA-1"] });
		expect(store.byId("SPA-1")?.description).toBe("full text");

		await store.pin(["SPA-1"]);
		expect(getTasksByIds).toHaveBeenCalledTimes(1);
	});

	it("remembers ids the server reports as missing", async () => {
		const store = createTaskStore(first, 1);
		getTasksByIds.mockResolvedValue({ items: [], missing: ["SPA-9"] });

		await store.pin(["SPA-9"]);

		expect(store.isAbsent("SPA-9")).toBe(true);

		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledTimes(1);
	});

	it("marks a failed request as failed, not as missing", async () => {
		const store = createTaskStore(first, 1);
		getTasksByIds.mockRejectedValue(new Error("offline"));

		await store.pin(["SPA-9"]);

		expect(store.isFailed("SPA-9")).toBe(true);
		expect(store.isAbsent("SPA-9")).toBe(false);

		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledTimes(1);

		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });
		getTasks.mockResolvedValue(pageResult(first, 1));
		await store.load(page());

		expect(store.isFailed("SPA-9")).toBe(false);

		await store.pin(["SPA-9"]);

		expect(getTasksByIds).toHaveBeenCalledTimes(2);
	});

	it("keeps pinned tasks that are outside a freshly loaded page", async () => {
		const store = createTaskStore(first, 1);
		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });
		await store.pin(["SPA-9"]);

		getTasks.mockResolvedValue(
			pageResult([task("SPA-1", { title: "renamed" })], 1),
		);
		await store.load(page());

		expect(store.byId("SPA-9")?.id).toBe("SPA-9");
		expect(store.byId("SPA-1")?.title).toBe("renamed");
	});

	it("saves a pinned task in place instead of dropping it", async () => {
		const store = createTaskStore(first, 1);
		getTasksByIds.mockResolvedValue({ items: [task("SPA-9")], missing: [] });
		await store.pin(["SPA-9"]);
		updateTask.mockResolvedValue(task("SPA-9", { title: "edited" }));

		await store.save("SPA-9", { title: "edited" });

		expect(store.byId("SPA-9")?.title).toBe("edited");
		expect(store.tasks.map((item) => item.id)).toEqual(["SPA-1"]);
	});

	it("reports a successful mutation so counters can be reloaded", async () => {
		const onMutate = vi.fn();
		const store = createTaskStore(first, 1, onMutate);
		updateTask.mockResolvedValue(task("SPA-1", { status: "done" }));
		deleteTask.mockResolvedValue(undefined);

		await store.save("SPA-1", { status: "done" });
		await store.destroy("SPA-1");

		expect(onMutate).toHaveBeenCalledTimes(2);
	});

	it("stays quiet when the mutation fails", async () => {
		const onMutate = vi.fn();
		const store = createTaskStore(first, 1, onMutate);
		updateTask.mockRejectedValue(new Error("offline"));

		await expect(store.save("SPA-1", { status: "done" })).rejects.toThrow(
			"offline",
		);

		expect(onMutate).not.toHaveBeenCalled();
	});
});
