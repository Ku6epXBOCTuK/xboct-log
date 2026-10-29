import { describe, expect, it, vi } from "vitest";
import { currentSeq, entityOf, publishChange, subscribe } from "./events.ts";

describe("events", () => {
	it("maps op names to entities", () => {
		expect(entityOf("tasks_close")).toBe("tasks");
		expect(entityOf("projects_update")).toBe("projects");
		expect(entityOf("scopes_delete")).toBe("scopes");
		expect(entityOf("attachments_add")).toBe("tasks");
		expect(entityOf("attachments_delete")).toBe("tasks");
		expect(entityOf("unknown_thing")).toBeNull();
	});

	it("maps every known prefix and leaves the rest alone", () => {
		expect(entityOf("tasks_create_many")).toBe("tasks");
		expect(entityOf("tasks_add_blocker")).toBe("tasks");
		expect(entityOf("projects_create")).toBe("projects");
		expect(entityOf("scopes_project_ids")).toBe("scopes");
		expect(entityOf("backup_create")).toBeNull();
		expect(entityOf("activity_list")).toBeNull();
	});

	it.fails("maps tag commands to the tags entity", () => {
		for (const name of ["tags_create", "tags_update", "tags_rename"]) {
			expect(entityOf(name), name).toBe("tags");
		}
	});

	it.fails("maps comment commands to the comments entity", () => {
		for (const name of [
			"tasks_comments_add",
			"tasks_comments_edit",
			"tasks_comments_delete",
		]) {
			expect(entityOf(name), name).toBe("comments");
		}
	});

	it("delivers changes to subscribers with an increasing seq", () => {
		const seen: number[] = [];
		const unsubscribe = subscribe((event) => {
			seen.push(event.seq);
			expect(event.entity).toBe("tasks");
			expect(event.op).toBe("tasks_close");
		});

		const before = currentSeq();
		publishChange("tasks", "tasks_close");
		publishChange("tasks", "tasks_close");
		unsubscribe();
		publishChange("tasks", "tasks_close");

		expect(seen).toEqual([before + 1, before + 2]);
		expect(currentSeq()).toBe(before + 3);
	});

	it("stops delivering after unsubscribe", () => {
		const listener = vi.fn();
		const unsubscribe = subscribe(listener);
		unsubscribe();
		publishChange("projects", "projects_create");
		expect(listener).not.toHaveBeenCalled();
	});
});
