import { describe, expect, it } from "vitest";
import {
	appPath,
	listPath,
	parsePath,
	taskPath,
} from "#lib/navigation/paths.ts";

describe("parsePath", () => {
	it("ignores paths outside the categories", () => {
		expect(parsePath("/")).toEqual({
			category: null,
			project: null,
			taskId: null,
			documentId: null,
		});
		expect(parsePath("/backups")).toEqual({
			category: null,
			project: null,
			taskId: null,
			documentId: null,
		});
	});

	it("reads a category without a project", () => {
		expect(parsePath("/tasks")).toEqual({
			category: "tasks",
			project: null,
			taskId: null,
			documentId: null,
		});
		expect(parsePath("/activity")).toEqual({
			category: "activity",
			project: null,
			taskId: null,
			documentId: null,
		});
	});

	it("reads a project segment", () => {
		expect(parsePath("/tasks/project/xboct-log")).toEqual({
			category: "tasks",
			project: "xboct-log",
			taskId: null,
			documentId: null,
		});
		expect(parsePath("/kanban/project/inbox/")).toEqual({
			category: "kanban",
			project: "inbox",
			taskId: null,
			documentId: null,
		});
	});

	it("reads a nested task", () => {
		expect(parsePath("/tasks/project/xboct-log/LOG-42")).toEqual({
			category: "tasks",
			project: "xboct-log",
			taskId: "LOG-42",
			documentId: null,
		});
		expect(parsePath("/tasks/project/xboct-log/log-42")).toEqual({
			category: "tasks",
			project: "xboct-log",
			taskId: "log-42",
			documentId: null,
		});
	});

	it("reads a nested document", () => {
		expect(parsePath("/documents/project/xboct-log/DOC-1")).toEqual({
			category: "documents",
			project: "xboct-log",
			taskId: null,
			documentId: "DOC-1",
		});
	});

	it("reads the short task alias", () => {
		expect(parsePath("/tasks/LOG-42")).toEqual({
			category: "tasks",
			project: null,
			taskId: "LOG-42",
			documentId: null,
		});
	});

	it("does not read task ids from other categories", () => {
		expect(parsePath("/kanban/project/inbox/LOG-42")).toEqual({
			category: "kanban",
			project: "inbox",
			taskId: null,
			documentId: null,
		});
	});

	it("ignores a malformed or overlong task path", () => {
		expect(parsePath("/tasks/LOG-42/history")).toEqual({
			category: "tasks",
			project: null,
			taskId: null,
			documentId: null,
		});
		expect(parsePath("/tasks/42")).toEqual({
			category: "tasks",
			project: null,
			taskId: null,
			documentId: null,
		});
	});
});

describe("appPath", () => {
	it("accepts the root and single-segment routes", () => {
		expect(appPath("/")).toBe("/");
		expect(appPath("/tasks")).toBe("/tasks");
		expect(appPath("/kanban")).toBe("/kanban");
		expect(appPath("/activity")).toBe("/activity");
		expect(appPath("/deleted")).toBe("/deleted");
		expect(appPath("/backups")).toBe("/backups");
		expect(appPath("/tags")).toBe("/tags");
		expect(appPath("/plans")).toBe("/plans");
		expect(appPath("/documents")).toBe("/documents");
		expect(appPath("/tags/x")).toBeNull();
	});

	it("accepts project, task and document routes", () => {
		expect(appPath("/kanban/project/xboct-log")).toBe(
			"/kanban/project/xboct-log",
		);
		expect(appPath("/tasks/project/xboct-log")).toBe(
			"/tasks/project/xboct-log",
		);
		expect(appPath("/documents/project/xboct-log")).toBe(
			"/documents/project/xboct-log",
		);
		expect(appPath("/tasks/LOG-42")).toBe("/tasks/LOG-42");
		expect(appPath("/tasks/project/xboct-log/LOG-42")).toBe(
			"/tasks/project/xboct-log/LOG-42",
		);
		expect(appPath("/documents/project/xboct-log/DOC-1")).toBe(
			"/documents/project/xboct-log/DOC-1",
		);
	});

	it("rejects paths that no route serves", () => {
		expect(appPath("/docs/notes.md")).toBeNull();
		expect(appPath("/kanban/LOG-42")).toBeNull();
		expect(appPath("/kanban/project")).toBeNull();
		expect(appPath("/kanban/project/inbox/LOG-42")).toBeNull();
		expect(appPath("/tasks/LOG-42/history")).toBeNull();
		expect(appPath("/tasks/42")).toBeNull();
		expect(appPath("/task")).toBeNull();
		expect(appPath("/backups/notes.md")).toBeNull();
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
