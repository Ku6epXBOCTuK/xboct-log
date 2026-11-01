import { describe, expect, it } from "vitest";
import { hasListSearch, parseListSearch, withoutListSearch } from "./search.ts";

function parse(query: string) {
	return parseListSearch(new URLSearchParams(query));
}

describe("list search", () => {
	it("reads the tags as one comma separated list", () => {
		expect(parse("?tags=UX,%20mcp&tags=agent").tags).toEqual([
			"ux",
			"mcp",
			"agent",
		]);
	});

	it("treats an empty tags value as no filter", () => {
		const state = parse("?tags=,%20,");

		expect(state.tags).toBeNull();
		expect(hasListSearch(state)).toBe(false);
	});

	it("maps the flags to the hide switches", () => {
		expect(parse("?closed=1&backlog=0")).toMatchObject({
			hideClosed: false,
			hideBacklog: true,
		});
		expect(parse("?closed=0&backlog=1")).toMatchObject({
			hideClosed: true,
			hideBacklog: false,
		});
		expect(parse("")).toMatchObject({
			hideClosed: null,
			hideBacklog: null,
		});
	});

	it("ignores a status that is not in the workflow", () => {
		expect(parse("?status=done").status).toBe("done");
		expect(parse("?status=archived").status).toBeNull();
	});

	it("drops the list keys and keeps the rest of the search", () => {
		expect(
			withoutListSearch("?theme=dark&tags=mcp&closed=1&backlog=0&status=open"),
		).toBe("?theme=dark");
		expect(withoutListSearch("?tags=mcp")).toBe("");
	});
});
