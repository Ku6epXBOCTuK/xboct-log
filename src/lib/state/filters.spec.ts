import { describe, expect, it } from "vitest";
import { createFilters } from "./filters.svelte.ts";

describe("closed tasks filter", () => {
	it("hides closed statuses by default", () => {
		const filters = createFilters(null);

		expect(filters.hideClosed).toBe(true);
		expect(filters.status).toBe("all");
		expect(filters.statusChanged).toBe(false);
	});

	it("shows closed tasks as soon as a closed status is picked", () => {
		const filters = createFilters(null);

		filters.status = "done";

		expect(filters.hideClosed).toBe(false);
		expect(filters.status).toBe("done");
	});

	it("drops a closed status when closed tasks are hidden again", () => {
		const filters = createFilters(null);
		filters.status = "cancelled";

		filters.toggleClosed();

		expect(filters.hideClosed).toBe(true);
		expect(filters.status).toBe("all");
		expect(filters.statusChanged).toBe(false);
	});

	it("keeps an open status when closed tasks are hidden again", () => {
		const filters = createFilters(null);
		filters.toggleClosed();
		filters.status = "in-progress";

		filters.toggleClosed();

		expect(filters.hideClosed).toBe(true);
		expect(filters.status).toBe("in-progress");
	});

	it("returns to the first page after the toggle", () => {
		const filters = createFilters(null);
		filters.setPage(4);

		filters.toggleClosed();

		expect(filters.page).toBe(1);
	});
});

describe("backlog filter", () => {
	it("starts with the backlog visible", () => {
		const filters = createFilters(null);

		expect(filters.hideBacklog).toBe(false);
		expect(filters.statusChanged).toBe(false);
	});

	it("drops an explicit backlog status when the backlog is hidden", () => {
		const filters = createFilters(null);
		filters.status = "backlog";

		filters.toggleBacklog();

		expect(filters.hideBacklog).toBe(true);
		expect(filters.status).toBe("all");
	});

	it("shows the backlog again when its status is picked", () => {
		const filters = createFilters(null);
		filters.toggleBacklog();

		filters.status = "backlog";

		expect(filters.hideBacklog).toBe(false);
	});

	it("is cleared by the status reset and by clear", () => {
		const filters = createFilters(null);
		filters.toggleBacklog();
		filters.resetStatus();
		expect(filters.hideBacklog).toBe(false);

		filters.toggleBacklog();
		filters.clear();
		expect(filters.hideBacklog).toBe(false);
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
