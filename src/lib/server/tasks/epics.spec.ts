import { describe, expect, it } from "vitest";
import { failure, setup, unwrap } from "../app-test-kit";
import { createProject } from "../projects";
import {
	createTask,
	deleteTask,
	getTask,
	listTasks,
	updateTask,
} from "../tasks";

describe("epic parent rules", () => {
	it("rejects a deleted task as an epic parent", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Gone", is_epic: true }),
		);
		unwrap(deleteTask(db, epic.id));

		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: epic.id }),
		);

		expect(error.kind).toBe("not_found");
	});

	it("rejects an epic from another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "bil", title: "Big", is_epic: true }),
		);
		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: epic.id }),
		);

		expect(error.message).toBe("epic must belong to the same project");
	});

	it("rejects a non-epic as epic parent", async () => {
		const db = await setup();
		const plain = unwrap(createTask(db, { project_id: "spa", title: "Plain" }));
		const error = failure(
			createTask(db, { project_id: "spa", title: "X", epic_id: plain.id }),
		);

		expect(error.message).toContain("is not an epic");
	});

	it("rejects a task as its own epic", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Loop" }));
		const error = failure(
			updateTask(db, task.id, { is_epic: true, epic_id: task.id }),
		);

		expect(error.message).toBe("a task cannot be its own epic");
	});
});

describe("epic guards", () => {
	it("rejects an epic with an epic", async () => {
		const db = await setup();
		const parent = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);

		const error = failure(
			createTask(db, {
				project_id: "spa",
				title: "Nested",
				is_epic: true,
				epic_id: parent.id,
			}),
		);

		expect(error.kind).toBe("validation");
		expect(error.message).toContain("epics are flat");
		expect(listTasks(db, { is_epic: true })).toHaveLength(1);
	});

	it("rejects promoting a task that belongs to an epic", async () => {
		const db = await setup();
		const first = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Other", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: first.id }),
		);

		const promote = failure(updateTask(db, child.id, { is_epic: true }));
		const attach = failure(updateTask(db, second.id, { epic_id: first.id }));

		expect(promote.kind).toBe("validation");
		expect(promote.message).toContain("epics are flat");
		expect(attach.kind).toBe("validation");
		expect(attach.message).toContain("epics are flat");
		expect(getTask(db, child.id)?.is_epic).toBe(false);
		expect(getTask(db, second.id)?.epic_id).toBeNull();
	});

	it("rejects demoting an epic with subtasks", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "Child", epic_id: epic.id }),
		);

		const error = failure(updateTask(db, epic.id, { is_epic: false }));

		expect(error.kind).toBe("validation");
		expect(error.message).toContain("cannot demote");
	});

	it("demotes an epic without subtasks", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Root", is_epic: true }),
		);

		const demoted = unwrap(updateTask(db, epic.id, { is_epic: false }));

		expect(demoted.is_epic).toBe(false);
	});
});
