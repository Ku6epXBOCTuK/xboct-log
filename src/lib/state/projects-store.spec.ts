import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "#lib/types.ts";

const getProjects = vi.fn();
const createProject = vi.fn();
const updateProject = vi.fn();

vi.mock("#lib/remote/projects.remote.ts", () => ({
	getProjects: (input: unknown) => getProjects(input),
	createProject: (input: unknown) => createProject(input),
	updateProject: (input: unknown) => updateProject(input),
}));

vi.mock("#lib/remote/fresh.ts", () => ({
	fetchFresh: (value: unknown) => value,
}));

const { createProjectStore } = await import("./projects.svelte.ts");

function project(id: string, extra: Partial<Project> = {}): Project {
	return {
		id,
		name: id,
		prefix: id.slice(0, 3).toUpperCase(),
		repo: null,
		created_at: "2026-01-01T00:00:00.000Z",
		archived_at: null,
		...extra,
	};
}

describe("project store", () => {
	beforeEach(() => {
		getProjects.mockReset();
		createProject.mockReset();
		updateProject.mockReset();
	});

	it("reloads every project with fresh counters", async () => {
		const store = createProjectStore([
			project("alpha", { task_counts: { open: 1 } }),
		]);
		getProjects.mockResolvedValue([
			project("alpha", { task_counts: { open: 4 } }),
			project("beta", { task_counts: { open: 2 } }),
		]);

		await store.refresh();

		expect(getProjects).toHaveBeenCalledWith({ includeArchived: true });
		expect(store.all.map((item) => item.id)).toEqual(["alpha", "beta"]);
		expect(store.all[0]?.task_counts).toEqual({ open: 4 });
	});

	it("keeps the previous list when the reload fails", async () => {
		const store = createProjectStore([
			project("alpha", { task_counts: { open: 1 } }),
		]);
		getProjects.mockRejectedValue(new Error("offline"));

		await expect(store.refresh()).rejects.toThrow("offline");

		expect(store.all.map((item) => item.id)).toEqual(["alpha"]);
	});

	it("keeps counters when an update returns a project without them", async () => {
		const store = createProjectStore([
			project("alpha", {
				task_counts: { open: 4, done: 2 },
				epic_counts: { open: 1 },
			}),
		]);
		updateProject.mockResolvedValue(project("alpha", { name: "renamed" }));

		await store.rename("alpha", "renamed");

		expect(store.all[0]?.name).toBe("renamed");
		expect(store.all[0]?.task_counts).toEqual({ open: 4, done: 2 });
		expect(store.all[0]?.epic_counts).toEqual({ open: 1 });
	});
});
