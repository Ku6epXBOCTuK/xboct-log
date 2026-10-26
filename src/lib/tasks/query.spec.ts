import { describe, expect, it } from "vitest";
import type { Filters } from "#lib/state/filters.svelte.ts";
import { buildTaskQuery } from "./query.ts";

function filters(overrides: Partial<Filters> = {}): Filters {
	return {
		activeProject: null,
		status: "all",
		priority: "all",
		epic: "any",
		scope: "any",
		query: "",
		selectedTags: [],
		hideClosed: true,
		sortKey: "updated",
		sortOrder: "desc",
		page: 1,
		...overrides,
	} as unknown as Filters;
}

describe("task query", () => {
	it("sends only the active statuses while closed tasks are hidden", () => {
		expect(buildTaskQuery(filters()).status).toEqual([
			"open",
			"in-progress",
			"blocked",
		]);
		expect(
			buildTaskQuery(filters({ hideClosed: false })).status,
		).toBeUndefined();
	});

	it("splits the search into text, number and id terms", () => {
		const query = buildTaskQuery(filters({ query: 'login "=29" =LOG-42' }));

		expect(query.q_any).toEqual(["login"]);
		expect(query.number_exact).toEqual([29]);
		expect(query.id_exact).toEqual(["LOG-42"]);
	});

	it("keeps words of an empty exact token out of the search", () => {
		const query = buildTaskQuery(filters({ query: "plain words" }));

		expect(query.q_any).toEqual(["plain", "words"]);
		expect(query.number_exact).toBeUndefined();
		expect(query.id_exact).toBeUndefined();
	});

	it("maps the page onto limit and offset", () => {
		const query = buildTaskQuery(filters({ page: 3 }), 3, 20);

		expect(query.limit).toBe(20);
		expect(query.offset).toBe(40);
	});
});
