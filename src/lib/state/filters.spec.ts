import { describe, expect, it } from "vitest";
import { ACTIVE_STATUSES, DEFAULT_STATUSES } from "#lib/types.ts";
import { createFilters } from "./filters.svelte.ts";

describe("status filter", () => {
	it("starts from everything but the closed statuses", () => {
		const filters = createFilters(null);

		expect(filters.statuses).toEqual([
			"backlog",
			"open",
			"in-progress",
			"blocked",
		]);
		expect(filters.statusChanged).toBe(false);
	});

	it("adds a status and drops it on the second toggle", () => {
		const filters = createFilters(null);

		filters.toggleStatus("done");
		expect(filters.statuses).toContain("done");

		filters.toggleStatus("done");
		expect(filters.statuses).toEqual([...DEFAULT_STATUSES]);
	});

	it("keeps the workflow order whatever the toggle order", () => {
		const filters = createFilters(null);

		filters.toggleStatus("done");
		filters.toggleStatus("backlog");

		expect(filters.statuses).toEqual([
			"open",
			"in-progress",
			"blocked",
			"done",
		]);
	});

	it("does not let the last status be toggled off", () => {
		const filters = createFilters(null);
		filters.setStatuses(["blocked"]);

		filters.toggleStatus("blocked");

		expect(filters.statuses).toEqual(["blocked"]);
	});

	it("narrows the set to the picked status", () => {
		const filters = createFilters(null);
		filters.setPage(3);

		filters.pickStatus("done");

		expect(filters.statuses).toEqual(["done"]);
		expect(filters.statusChanged).toBe(true);
		expect(filters.page).toBe(1);
	});

	it("returns to the default set when the only status is picked again", () => {
		const filters = createFilters(null);
		filters.pickStatus("blocked");

		filters.pickStatus("blocked");

		expect(filters.statuses).toEqual([...DEFAULT_STATUSES]);
		expect(filters.statusChanged).toBe(false);
	});

	it("replaces the single status with another pick", () => {
		const filters = createFilters(null);
		filters.pickStatus("blocked");

		filters.pickStatus("done");

		expect(filters.statuses).toEqual(["done"]);
	});

	it("falls back to the default set for an empty list", () => {
		const filters = createFilters(null);
		filters.setStatuses(["done"]);

		filters.setStatuses([]);

		expect(filters.statuses).toEqual([...DEFAULT_STATUSES]);
	});

	it("recognizes the default set in any order", () => {
		const filters = createFilters(null);

		filters.setStatuses([...DEFAULT_STATUSES].reverse());

		expect(filters.statusChanged).toBe(false);
	});

	it("reports a changed set and resets it", () => {
		const filters = createFilters(null);
		filters.setStatuses([...ACTIVE_STATUSES, "done"]);

		expect(filters.statusChanged).toBe(true);

		filters.resetStatus();

		expect(filters.statuses).toEqual([...DEFAULT_STATUSES]);
		expect(filters.statusChanged).toBe(false);
	});

	it("returns to the first page after a change", () => {
		const filters = createFilters(null);
		filters.setPage(4);

		filters.toggleStatus("done");

		expect(filters.page).toBe(1);
	});

	it("restores the default set on clear", () => {
		const filters = createFilters(null);
		filters.toggleStatus("done");

		filters.clear();

		expect(filters.statuses).toEqual([...DEFAULT_STATUSES]);
	});
});

describe("tag seeding", () => {
	it("replaces the tags and returns to the first page", () => {
		const filters = createFilters(null);
		filters.toggleTag("ui");
		filters.setPage(3);

		filters.setTags(["mcp", "agent", "mcp"]);

		expect(filters.selectedTags).toEqual(["mcp", "agent"]);
		expect(filters.page).toBe(1);
	});
});
