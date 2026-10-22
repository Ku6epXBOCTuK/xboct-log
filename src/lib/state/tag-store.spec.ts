import { describe, expect, it } from "vitest";
import { createTagStore } from "./tags.svelte.ts";

const dictionary = [
	{ tag: "ui", count: 9, active: 4 },
	{ tag: "enhancement", count: 12, active: 7 },
	{ tag: "legacy", count: 5, active: 0 },
	{ tag: "bug", count: 3, active: 2 },
];

describe("tag store", () => {
	it("drops the tags that closed tasks keep alive", () => {
		const store = createTagStore(dictionary);

		expect(store.ranked([]).map((entry) => entry.tag)).toEqual([
			"enhancement",
			"ui",
			"bug",
		]);
	});

	it("puts the tags used in the project first", () => {
		const store = createTagStore(dictionary);

		expect(
			store
				.ranked([
					{ tag: "bug", count: 6 },
					{ tag: "ui", count: 1 },
				])
				.map((entry) => entry.tag),
		).toEqual(["bug", "ui", "enhancement"]);
	});

	it("breaks ties by name", () => {
		const store = createTagStore([
			{ tag: "zeta", count: 1, active: 1 },
			{ tag: "alpha", count: 1, active: 1 },
		]);

		expect(store.ranked([]).map((entry) => entry.tag)).toEqual([
			"alpha",
			"zeta",
		]);
	});

	it("keeps the counts for the dropdown", () => {
		const store = createTagStore(dictionary);
		const [first] = store.ranked([]);

		expect(first).toEqual({ tag: "enhancement", count: 12, active: 7 });
	});
});
