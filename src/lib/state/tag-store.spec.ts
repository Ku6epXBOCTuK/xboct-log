import { describe, expect, it } from "vitest";
import { createTagStore } from "./tags.svelte.ts";

const dictionary = [
	{ tag: "ui", count: 9, active: 4 },
	{ tag: "enhancement", count: 12, active: 7 },
	{ tag: "legacy", count: 5, active: 0 },
	{ tag: "bug", count: 3, active: 2 },
];

describe("tag store", () => {
	it("puts the tags of the project first, by their own count", () => {
		const store = createTagStore(dictionary, ["ui", "bug"]);
		const scope = [
			{ tag: "ui", count: 2, active: 1 },
			{ tag: "bug", count: 5, active: 0 },
		];

		expect(store.picker(scope).suggestions).toEqual([
			"bug",
			"ui",
			"enhancement",
			"legacy",
		]);
	});

	it("keeps the tags that only closed tasks carry", () => {
		const store = createTagStore(dictionary, []);

		expect(store.picker([]).suggestions).toEqual([
			"enhancement",
			"ui",
			"legacy",
			"bug",
		]);
	});

	it("suggests the dictionary tags no task carries, last and by name", () => {
		const store = createTagStore(dictionary, ["zzz", "bug", "aaa"]);

		expect(store.picker([]).suggestions).toEqual([
			"enhancement",
			"ui",
			"legacy",
			"bug",
			"aaa",
			"zzz",
		]);
	});

	it("breaks ties by name", () => {
		const store = createTagStore([], []);

		expect(
			store.picker([
				{ tag: "zeta", count: 1, active: 1 },
				{ tag: "alpha", count: 1, active: 1 },
			]).suggestions,
		).toEqual(["alpha", "zeta"]);
	});

	it("treats a tag named after a prototype member as unused", () => {
		const store = createTagStore([], ["constructor", "aaa"]);

		expect(store.picker([]).suggestions).toEqual(["aaa", "constructor"]);
	});

	it("reports only the counts of the project", () => {
		const store = createTagStore(dictionary, []);
		const scope = [{ tag: "ui", count: 2, active: 1 }];

		expect(store.picker(scope).counts).toEqual({ ui: 2 });
	});

	it("exposes the dictionary names", () => {
		const store = createTagStore(dictionary, ["bug", "idea"]);

		expect(store.dictionary).toEqual(["bug", "idea"]);
	});
});
