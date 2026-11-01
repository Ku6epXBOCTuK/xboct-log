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

	it("reads the statuses in the workflow order", () => {
		expect(parse("?status=done,open").statuses).toEqual(["open", "done"]);
		expect(parse("?status=open&status=blocked").statuses).toEqual([
			"open",
			"blocked",
		]);
	});

	it("ignores a status that is not in the workflow", () => {
		expect(parse("?status=archived,open").statuses).toEqual(["open"]);
		expect(parse("?status=archived").statuses).toBeNull();
	});

	it("treats an empty status value as no filter", () => {
		const state = parse("?status=,%20,");

		expect(state.statuses).toBeNull();
		expect(hasListSearch(state)).toBe(false);
	});

	it("drops the list keys and keeps the rest of the search", () => {
		expect(withoutListSearch("?theme=dark&tags=mcp&status=open,blocked")).toBe(
			"?theme=dark",
		);
		expect(withoutListSearch("?tags=mcp")).toBe("");
	});
});
