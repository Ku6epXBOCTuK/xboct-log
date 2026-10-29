import { describe, expect, it } from "vitest";
import {
	advancedFilledCount,
	draftHasContent,
	epicsForProject,
	fitDraftToProjects,
	siblingEpics,
	type TaskFieldValues,
} from "./fields";
import type { Project, Scope, Task } from "#lib/types.ts";

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

function values(overrides: Partial<Task>): TaskFieldValues {
	return {
		project_id: "inbox",
		priority: "medium",
		is_epic: false,
		epic_id: null,
		scope_id: null,
		source_file: null,
		tags: [],
		estimate: null,
		assignee: null,
		due_at: null,
		description: "",
		...overrides,
	};
}

function project(id: string): Project {
	return {
		id,
		name: id,
		prefix: id.toUpperCase(),
		repo: null,
		created_at: "2026-01-01T00:00:00.000Z",
		archived_at: null,
	};
}

function scope(id: number, projectId: string): Scope {
	return {
		id,
		project_id: projectId,
		name: `scope ${id}`,
		created_at: "2026-01-01T00:00:00.000Z",
	};
}

describe("draftHasContent", () => {
	it("is empty without a title, description and tags", () => {
		expect(draftHasContent(values({}), "  ")).toBe(false);
	});

	it("is filled by any of the tracked fields", () => {
		expect(draftHasContent(values({}), "title")).toBe(true);
		expect(draftHasContent(values({ description: "text" }), "")).toBe(true);
		expect(draftHasContent(values({ tags: ["ui"] }), "")).toBe(true);
		expect(draftHasContent(values({ estimate: "M" }), "")).toBe(true);
	});

	it("is filled by a link without any other content", () => {
		expect(
			draftHasContent(values({}), "", {
				blocked_by: ["LOG-1"],
				blocks: [],
				relates_to: [],
				duplicates: [],
				duplicated_by: [],
			}),
		).toBe(true);
	});
});

describe("fitDraftToProjects", () => {
	const projects = [project("inbox"), project("other")];
	const epics = [
		task({ id: "E-1", project_id: "inbox" }),
		task({ id: "E-2", project_id: "other" }),
	];
	const scopes = [scope(1, "inbox"), scope(2, "other")];

	it("keeps a draft that still matches the data", () => {
		const fitted = fitDraftToProjects(
			values({ project_id: "inbox", epic_id: "E-1", scope_id: 1 }),
			projects,
			epics,
			scopes,
			"other",
		);

		expect(fitted.project_id).toBe("inbox");
		expect(fitted.epic_id).toBe("E-1");
		expect(fitted.scope_id).toBe(1);
	});

	it("falls back when the project is gone", () => {
		const fitted = fitDraftToProjects(
			values({ project_id: "deleted", epic_id: "E-1", scope_id: 1 }),
			projects,
			epics,
			scopes,
			"inbox",
		);

		expect(fitted.project_id).toBe("inbox");
		expect(fitted.epic_id).toBeNull();
		expect(fitted.scope_id).toBeNull();
	});

	it("drops an epic or scope of another project", () => {
		const fitted = fitDraftToProjects(
			values({ project_id: "inbox", epic_id: "E-2", scope_id: 2 }),
			projects,
			epics,
			scopes,
			"inbox",
		);

		expect(fitted.epic_id).toBeNull();
		expect(fitted.scope_id).toBeNull();
	});

	it("drops the epic of an epic draft", () => {
		const fitted = fitDraftToProjects(
			values({ project_id: "inbox", is_epic: true, epic_id: "E-1" }),
			projects,
			epics,
			scopes,
			"inbox",
		);

		expect(fitted.epic_id).toBeNull();
	});
});
