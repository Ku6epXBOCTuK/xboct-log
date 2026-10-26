import { describe, expect, it } from "vitest";
import { advancedFilledCount, epicsForProject, siblingEpics } from "./fields";
import type { Task } from "#lib/types.ts";

function task(overrides: Partial<Task>): Task {
	return {
		id: "X-1",
		project_id: "inbox",
		number: 1,
		title: "task",
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
		...overrides,
	};
}

describe("advancedFilledCount", () => {
	it("counts the filled advanced fields", () => {
		expect(
			advancedFilledCount({
				project_id: "inbox",
				priority: "medium",
				is_epic: false,
				epic_id: null,
				scope_id: null,
				source_file: "docs/backlog.md",
				tags: [],
				estimate: "M",
				assignee: null,
				due_at: "2026-10-30",
				description: "",
			}),
		).toBe(3);
	});

	it("counts an epic type as a filled field", () => {
		expect(
			advancedFilledCount({
				project_id: "inbox",
				priority: "medium",
				is_epic: true,
				epic_id: null,
				scope_id: null,
				source_file: null,
				tags: [],
				estimate: null,
				assignee: null,
				due_at: null,
				description: "",
			}),
		).toBe(1);
	});
});

describe("epicsForProject", () => {
	it("keeps open and in-progress epics of the project", () => {
		const epics = [
			task({ id: "E-1", status: "open" }),
			task({ id: "E-2", status: "in-progress" }),
			task({ id: "E-3", status: "blocked" }),
		];

		const options = epicsForProject(epics, "inbox");

		expect(options.map((epic) => epic.id)).toEqual(["E-1", "E-2", "E-3"]);
	});

	it("drops closed epics", () => {
		const epics = [
			task({ id: "E-1", status: "open" }),
			task({ id: "E-2", status: "done" }),
			task({ id: "E-3", status: "cancelled" }),
		];

		const options = epicsForProject(epics, "inbox");

		expect(options.map((epic) => epic.id)).toEqual(["E-1"]);
	});

	it("drops epics from other projects", () => {
		const epics = [
			task({ id: "E-1", project_id: "inbox" }),
			task({ id: "E-2", project_id: "other" }),
		];

		const options = epicsForProject(epics, "inbox");

		expect(options.map((epic) => epic.id)).toEqual(["E-1"]);
	});

	it("keeps the already assigned epic even when it is closed", () => {
		const epics = [
			task({ id: "E-1", status: "open" }),
			task({ id: "E-2", status: "done" }),
		];

		const options = epicsForProject(epics, "inbox", "E-2");

		expect(options.map((epic) => epic.id)).toEqual(["E-1", "E-2"]);
	});
});

describe("siblingEpics", () => {
	it("drops the selected task itself", () => {
		const epics = [task({ id: "E-1" }), task({ id: "E-2" })];

		const options = siblingEpics(epics, task({ id: "E-1" }));

		expect(options.map((epic) => epic.id)).toEqual(["E-2"]);
	});

	it("hides closed epics but keeps the current assignment", () => {
		const epics = [
			task({ id: "E-1", status: "done" }),
			task({ id: "E-2", status: "open" }),
			task({ id: "E-3", status: "cancelled" }),
		];

		const options = siblingEpics(epics, task({ id: "T-1", epic_id: "E-3" }));

		expect(options.map((epic) => epic.id)).toEqual(["E-2", "E-3"]);
	});

	it("returns nothing when no task is selected", () => {
		expect(siblingEpics([task({ id: "E-1" })], null)).toEqual([]);
	});
});
