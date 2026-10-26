import { describe, expect, it } from "vitest";
import { pageCount, pageItems } from "./paging";

describe("pageCount", () => {
	it("reports at least one page", () => {
		expect(pageCount(0)).toBe(1);
		expect(pageCount(1)).toBe(1);
	});

	it("rounds a partial page up", () => {
		expect(pageCount(20, 20)).toBe(1);
		expect(pageCount(21, 20)).toBe(2);
		expect(pageCount(1250, 20)).toBe(63);
	});
});

describe("pageItems", () => {
	it("lists every page while they fit", () => {
		expect(pageItems(1, 1)).toEqual([1]);
		expect(pageItems(2, 3)).toEqual([1, 2, 3]);
	});

	it("keeps the ends and collapses the middle", () => {
		expect(pageItems(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
	});

	it("drops the gap when only one page hides behind it", () => {
		expect(pageItems(5, 8)).toEqual([1, "gap", 4, 5, 6, 7, 8]);
		expect(pageItems(4, 6)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it("trims the neighbours at the edges", () => {
		expect(pageItems(1, 12)).toEqual([1, 2, "gap", 12]);
		expect(pageItems(12, 12)).toEqual([1, "gap", 11, 12]);
	});

	it("widens the window with siblings", () => {
		expect(pageItems(6, 12, 2)).toEqual([1, "gap", 4, 5, 6, 7, 8, "gap", 12]);
	});
});
