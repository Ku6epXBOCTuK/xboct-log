import { beforeEach, describe, expect, it, vi } from "vitest";

const getTaskOptions = vi.fn();
const getTags = vi.fn();

vi.mock("#lib/remote/options.remote.ts", () => ({
	getTaskOptions: (input: { project_id: string }) => getTaskOptions(input),
}));

vi.mock("#lib/remote/tags.remote.ts", () => ({
	getTags: (input: { project_id: string }) => getTags(input),
}));

vi.mock("#lib/remote/fresh.ts", () => ({
	fetchFresh: (value: unknown) => value,
}));

const { createProjectData } = await import("./project-data.svelte.ts");

describe("project data store", () => {
	beforeEach(() => {
		getTaskOptions.mockReset();
		getTags.mockReset();
	});

	it("keeps a project empty until it is loaded", () => {
		const store = createProjectData();

		expect(store.of("spa")).toBeUndefined();
	});

	it("loads the tasks and the tags of one project", async () => {
		const store = createProjectData();
		getTaskOptions.mockResolvedValue({ items: [{ id: "SPA-1" }], total: 1 });
		getTags.mockResolvedValue({
			items: [{ tag: "ui", count: 2, active: 1 }],
			total: 1,
		});

		store.ensure("spa");
		await vi.waitFor(() => expect(store.of("spa")).toBeDefined());

		expect(getTaskOptions).toHaveBeenCalledWith({ project_id: "spa" });
		expect(getTags).toHaveBeenCalledWith({ project_id: "spa" });
		expect(store.of("spa")).toEqual({
			tasks: [{ id: "SPA-1" }],
			tags: [{ tag: "ui", count: 2, active: 1 }],
		});
	});

	it("requests a project once", async () => {
		const store = createProjectData();
		getTaskOptions.mockResolvedValue({ items: [], total: 0 });
		getTags.mockResolvedValue({ items: [], total: 0 });

		store.ensure("spa");
		store.ensure("spa");
		await vi.waitFor(() => expect(store.of("spa")).toBeDefined());

		expect(getTaskOptions).toHaveBeenCalledTimes(1);
	});

	it("reloads the cached projects on refresh", async () => {
		const store = createProjectData();
		getTaskOptions.mockResolvedValue({ items: [{ id: "SPA-1" }], total: 1 });
		getTags.mockResolvedValue({ items: [], total: 0 });
		store.ensure("spa");
		await vi.waitFor(() => expect(store.of("spa")).toBeDefined());

		getTaskOptions.mockResolvedValue({ items: [{ id: "SPA-2" }], total: 1 });
		await store.refresh();

		expect(store.of("spa")?.tasks.map((task) => task.id)).toEqual(["SPA-2"]);
	});

	it("does not cache a failed request", async () => {
		const store = createProjectData();
		getTaskOptions.mockRejectedValue(new Error("offline"));
		getTags.mockResolvedValue({ items: [], total: 0 });

		store.ensure("spa");
		await vi.waitFor(() => expect(getTaskOptions).toHaveBeenCalledTimes(1));

		expect(store.of("spa")).toBeUndefined();

		getTaskOptions.mockResolvedValue({ items: [{ id: "SPA-1" }], total: 1 });
		await vi.waitFor(() => {
			store.ensure("spa");
			expect(store.of("spa")).toBeDefined();
		});
	});
});
