import { describe, expect, it } from "vitest";
import { activityFieldLabel, activityOpLabel } from "./labels.ts";

describe("activityOpLabel", () => {
	it("names the entity and the action", () => {
		expect(activityOpLabel("tasks_create")).toBe("Task created");
		expect(activityOpLabel("tasks_update")).toBe("Task updated");
		expect(activityOpLabel("tasks_close")).toBe("Task closed");
		expect(activityOpLabel("tasks_delete")).toBe("Task deleted");
		expect(activityOpLabel("projects_create")).toBe("Project created");
		expect(activityOpLabel("scopes_delete")).toBe("Scope deleted");
	});

	it("uses the plural for batch operations", () => {
		expect(activityOpLabel("tasks_create_many")).toBe("Tasks created");
		expect(activityOpLabel("tasks_close_many")).toBe("Tasks closed");
	});

	it("names the comment and the blocker actions", () => {
		expect(activityOpLabel("tasks_comments_add")).toBe("Comment added");
		expect(activityOpLabel("tasks_comments_edit")).toBe("Comment edited");
		expect(activityOpLabel("tasks_comments_delete")).toBe("Comment deleted");
		expect(activityOpLabel("tasks_add_blocker")).toBe("Blocker added");
		expect(activityOpLabel("tasks_remove_blocker")).toBe("Blocker removed");
	});

	it("falls back to a readable form for unknown operations", () => {
		expect(activityOpLabel("tasks_something_new")).toBe("Something new");
		expect(activityOpLabel("custom_op")).toBe("custom_op");
	});
});

describe("activityFieldLabel", () => {
	it("labels the known fields", () => {
		expect(activityFieldLabel("epic_id")).toBe("Epic");
		expect(activityFieldLabel("unknown_field")).toBe("unknown_field");
	});
});
