import { describe, expect, it } from "vitest";
import { createDraftStore } from "./draft.svelte.ts";
import type { TaskFieldValues } from "#lib/tasks/fields.ts";

function values(title: string): TaskFieldValues {
	return {
		project_id: "spa",
		priority: "medium",
		is_epic: false,
		epic_id: null,
		scope_id: null,
		source_file: null,
		tags: [],
		estimate: null,
		assignee: null,
		due_at: null,
		description: title,
	};
}

describe("draft store", () => {
	it("keeps the saved draft", () => {
		const store = createDraftStore();

		store.save({ values: values("first"), title: "first" });

		expect(store.saved?.title).toBe("first");
		expect(store.saved?.values.description).toBe("first");
	});

	it("remembers the last created task", () => {
		const store = createDraftStore();

		store.setLast({ id: "SPA-42", title: "created" });

		expect(store.last).toEqual({ id: "SPA-42", title: "created" });
	});

	it("drops the draft and keeps the last task", () => {
		const store = createDraftStore();

		store.save({ values: values("first"), title: "first" });
		store.setLast({ id: "SPA-42", title: "created" });
		store.clearDraft();

		expect(store.saved).toBeNull();
		expect(store.last?.id).toBe("SPA-42");
	});

	it("drops everything", () => {
		const store = createDraftStore();

		store.save({ values: values("first"), title: "first" });
		store.setLast({ id: "SPA-42", title: "created" });
		store.clear();

		expect(store.saved).toBeNull();
		expect(store.last).toBeNull();
	});
});
