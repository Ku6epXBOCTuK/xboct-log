import { describe, expect, it } from "vitest";
import type { Filters } from "#lib/state/filters.svelte.ts";
import { CLOSED_STATUSES, STATUSES } from "#lib/types.ts";
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
		expect(buildTaskQuery(filters()).status).toEqual(
			STATUSES.filter((status) => !CLOSED_STATUSES.includes(status)),
		);
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

	it("drops the filters for an exact-only query and scopes numbers to the project prefix", () => {
		const query = buildTaskQuery(
			filters({
				activeProject: "spa",
				status: "open",
				priority: "high",
				epic: "SPA-1",
				scope: 3,
				selectedTags: ["ui"],
				query: "=29 =30",
			}),
			1,
			50,
			"SPA",
		);

		expect(query.id_exact).toEqual(["SPA-29", "SPA-30"]);
		expect(query.number_exact).toBeUndefined();
		expect(query.project_id).toBeUndefined();
		expect(query.status).toBeUndefined();
		expect(query.priority).toBeUndefined();
		expect(query.epic_id).toBeUndefined();
		expect(query.has_epic).toBeUndefined();
		expect(query.scope_id).toBeUndefined();
		expect(query.tag).toBeUndefined();
	});

	it("searches a full id across every project even when a project is active", () => {
		const query = buildTaskQuery(
			filters({
				activeProject: "spa",
				status: "open",
				query: "=LOG-42",
			}),
			1,
			50,
			"SPA",
		);

		expect(query.id_exact).toEqual(["LOG-42"]);
		expect(query.project_id).toBeUndefined();
		expect(query.status).toBeUndefined();
	});

	it("keeps exact numbers global when the project prefix is unknown", () => {
		const query = buildTaskQuery(
			filters({ activeProject: "spa", status: "open", query: "=29" }),
			1,
			50,
		);

		expect(query.number_exact).toEqual([29]);
		expect(query.id_exact).toBeUndefined();
		expect(query.project_id).toBeUndefined();
		expect(query.status).toBeUndefined();
	});

	it("keeps the filters when an exact term is mixed with text", () => {
		const query = buildTaskQuery(
			filters({ activeProject: "spa", status: "open", query: "login =29" }),
			1,
			50,
			"SPA",
		);

		expect(query.q_any).toEqual(["login"]);
		expect(query.number_exact).toEqual([29]);
		expect(query.id_exact).toBeUndefined();
		expect(query.project_id).toBe("spa");
		expect(query.status).toEqual(["open"]);
	});

	it("maps the page onto limit and offset", () => {
		const query = buildTaskQuery(filters({ page: 3 }), 3, 20);

		expect(query.limit).toBe(20);
		expect(query.offset).toBe(40);
	});
});
