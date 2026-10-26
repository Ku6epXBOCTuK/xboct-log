import { describe, expect, it } from "vitest";
import { createSelection } from "./selection.svelte.ts";
import type { Task } from "#lib/types.ts";

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

const tasks = [task("SPA-1"), task("SPA-2", { project_id: "api" })];
const byId = (id: string) => tasks.find((item) => item.id === id);

describe("selection store", () => {
	it("starts empty", () => {
		const selection = createSelection({ byId });

		expect(selection.id).toBeNull();
		expect(selection.task).toBeNull();
		expect(selection.projectId).toBeNull();
	});

	it("resolves the selected task and its project", () => {
		const selection = createSelection({ byId });

		selection.select("SPA-2");

		expect(selection.id).toBe("SPA-2");
		expect(selection.task?.title).toBe("SPA-2");
		expect(selection.projectId).toBe("api");
	});

	it("clears the selection", () => {
		const selection = createSelection({ byId });

		selection.select("SPA-1");
		selection.clear();

		expect(selection.id).toBeNull();
		expect(selection.projectId).toBeNull();
	});

	it("keeps a stale id but reports no task", () => {
		const selection = createSelection({ byId });

		selection.select("SPA-99");

		expect(selection.id).toBe("SPA-99");
		expect(selection.task).toBeNull();
		expect(selection.projectId).toBeNull();
	});
});
