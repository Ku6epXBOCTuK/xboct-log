import { describe, expect, it } from "vitest";
import { exactFirst, matchesSearch, parseSearchQuery } from "./search";
import type { Task } from "#lib/types.ts";

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: "LOG-1",
		project_id: "xboct-log",
		number: 1,
		title: "task",
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
		...overrides,
	};
}

describe("parseSearchQuery", () => {
	it("reads a bare number as an exact number", () => {
		expect(parseSearchQuery("=29")).toEqual([{ kind: "number", number: 29 }]);
	});

	it("drops leading zeros of an exact number", () => {
		expect(parseSearchQuery("=029")).toEqual([{ kind: "number", number: 29 }]);
	});

	it("reads an exact id case-insensitively", () => {
		expect(parseSearchQuery("=log-29")).toEqual([{ kind: "id", id: "LOG-29" }]);
	});

	it("falls back to text when the exact value is neither number nor id", () => {
		expect(parseSearchQuery("=add")).toEqual([{ kind: "text", text: "add" }]);
	});

	it("splits several queries on whitespace", () => {
		expect(parseSearchQuery("129 130 =25")).toEqual([
			{ kind: "text", text: "129" },
			{ kind: "text", text: "130" },
			{ kind: "number", number: 25 },
		]);
	});

	it("keeps a quoted phrase in one term", () => {
		expect(parseSearchQuery('"add button"')).toEqual([
			{ kind: "text", text: "add button" },
		]);
	});

	it("treats an unterminated quote as the rest of the query", () => {
		expect(parseSearchQuery('"add but')).toEqual([
			{ kind: "text", text: "add but" },
		]);
	});

	it("ignores blank input and a lonely operator", () => {
		expect(parseSearchQuery("   ")).toEqual([]);
		expect(parseSearchQuery("=")).toEqual([]);
		expect(parseSearchQuery('""')).toEqual([]);
	});
});

describe("matchesSearch", () => {
	const tasks = [
		task({ id: "LOG-29", number: 29, title: "fix login" }),
		task({ id: "LOG-129", number: 129, title: "fix logout" }),
		task({ id: "LOG-290", number: 290, title: "describe 29" }),
	];

	it("matches an exact number only", () => {
		const visible = tasks.filter((item) =>
			matchesSearch(item, parseSearchQuery("=29")),
		);

		expect(visible.map((item) => item.id)).toEqual(["LOG-29"]);
	});

	it("matches an exact id regardless of case", () => {
		const visible = tasks.filter((item) =>
			matchesSearch(item, parseSearchQuery("=log-29")),
		);

		expect(visible.map((item) => item.id)).toEqual(["LOG-29"]);
	});

	it("keeps a bare number as a substring", () => {
		const visible = tasks.filter((item) =>
			matchesSearch(item, parseSearchQuery("129")),
		);

		expect(visible.map((item) => item.id)).toEqual(["LOG-129"]);
	});

	it("matches any of several terms", () => {
		const visible = tasks.filter((item) =>
			matchesSearch(item, parseSearchQuery("129 130 =29")),
		);

		expect(visible.map((item) => item.id)).toEqual(["LOG-29", "LOG-129"]);
	});

	it("matches a phrase with its spaces", () => {
		const phrase = task({ id: "LOG-2", title: "add button" });
		const split = task({ id: "LOG-3", title: "button to add" });

		expect(matchesSearch(phrase, parseSearchQuery('"add button"'))).toBe(true);
		expect(matchesSearch(split, parseSearchQuery('"add button"'))).toBe(false);
	});

	it("matches nothing against an empty query", () => {
		expect(matchesSearch(task(), parseSearchQuery(""))).toBe(true);
	});
});

describe("exactFirst", () => {
	it("moves the exact hits in front and keeps the rest in order", () => {
		const tasks = [
			task({ id: "LOG-1", number: 1 }),
			task({ id: "LOG-2", number: 2 }),
			task({ id: "LOG-3", number: 3 }),
		];

		const ordered = exactFirst(tasks, parseSearchQuery("=3"));

		expect(ordered.map((item) => item.id)).toEqual(["LOG-3", "LOG-1", "LOG-2"]);
	});

	it("returns the list untouched when there is no exact term", () => {
		const tasks = [task({ id: "LOG-1" }), task({ id: "LOG-2" })];

		expect(exactFirst(tasks, parseSearchQuery("fix"))).toBe(tasks);
	});
});
