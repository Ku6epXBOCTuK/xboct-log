import { describe, expect, it } from "vitest";
import { listPath, parsePath, taskPath } from "#lib/navigation/paths.ts";

describe("parsePath", () => {
	it("ignores paths outside the categories", () => {
		expect(parsePath("/")).toEqual({
			category: null,
			project: null,
			taskId: null,
		});
		expect(parsePath("/backups")).toEqual({
			category: null,
			project: null,
			taskId: null,
		});
	});

	it("reads a category without a project", () => {
		expect(parsePath("/tasks")).toEqual({
			category: "tasks",
			project: null,
			taskId: null,
		});
		expect(parsePath("/activity")).toEqual({
			category: "activity",
			project: null,
			taskId: null,
		});
	});

	it("reads a project segment", () => {
		expect(parsePath("/tasks/project/xboct-log")).toEqual({
			category: "tasks",
			project: "xboct-log",
			taskId: null,
		});
		expect(parsePath("/kanban/project/inbox/")).toEqual({
			category: "kanban",
			project: "inbox",
			taskId: null,
		});
	});

	it("reads a nested task", () => {
		expect(parsePath("/tasks/project/xboct-log/LOG-42")).toEqual({
			category: "tasks",
			project: "xboct-log",
			taskId: "LOG-42",
		});
		expect(parsePath("/tasks/project/xboct-log/log-42")).toEqual({
			category: "tasks",
			project: "xboct-log",
			taskId: "log-42",
		});
	});

	it("reads the short task alias", () => {
		expect(parsePath("/tasks/LOG-42")).toEqual({
			category: "tasks",
			project: null,
			taskId: "LOG-42",
		});
	});

	it("does not read task ids from other categories", () => {
		expect(parsePath("/kanban/project/inbox/LOG-42")).toEqual({
			category: "kanban",
			project: "inbox",
			taskId: null,
		});
	});

	it("ignores a malformed or overlong task path", () => {
		expect(parsePath("/tasks/LOG-42/history")).toEqual({
			category: "tasks",
			project: null,
			taskId: null,
		});
		expect(parsePath("/tasks/42")).toEqual({
			category: "tasks",
			project: null,
			taskId: null,
		});
	});
});

describe("builders", () => {
	it("builds list paths", () => {
		expect(listPath("tasks", null)).toBe("/tasks");
		expect(listPath("activity", "inbox")).toBe("/activity/project/inbox");
	});

	it("builds task paths", () => {
		expect(taskPath("xboct-log", "LOG-42")).toBe(
			"/tasks/project/xboct-log/LOG-42",
		);
	});
});
