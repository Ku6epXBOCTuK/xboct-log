import { describe, expect, it } from "vitest";
import { failure, setup, unwrap } from "../app-test-kit";
import { addLink } from "../links";
import { createProject } from "../projects";
import { createTask, deleteTask, getTask, moveTask } from "../tasks";

describe("task moves", () => {
	it("assigns the next number in the target project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createTask(db, { project_id: "bil", title: "Existing" }));
		const task = unwrap(createTask(db, { project_id: "spa", title: "Move" }));

		const moved = unwrap(moveTask(db, task.id, "bil"));

		expect(moved.id).toBe("BIL-2");
		expect(moved.project_id).toBe("bil");
		expect(getTask(db, task.id)).toBeUndefined();
	});

	it("detaches a child moved to another project", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);

		const moved = unwrap(moveTask(db, child.id, "bil"));

		expect(moved.id).toBe("BIL-1");
		expect(moved.epic_id).toBeNull();
	});

	it("moves an epic with its tasks and rewires the links", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const child = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);
		const leaf = unwrap(createTask(db, { project_id: "spa", title: "Leaf" }));

		const moved = unwrap(moveTask(db, epic.id, "bil"));

		expect(moved.id).toBe("BIL-1");
		expect(getTask(db, "BIL-1")?.id).toBe("BIL-1");
		expect(getTask(db, "BIL-2")?.epic_id).toBe("BIL-1");
		expect(getTask(db, child.id)).toBeUndefined();
		expect(getTask(db, leaf.id)?.id).toBe(leaf.id);
	});

	it("returns the task unchanged when the project matches", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Stay" }));

		const moved = unwrap(moveTask(db, task.id, "spa"));

		expect(moved.id).toBe(task.id);
		expect(moved.updated_at).toBe(task.updated_at);
	});

	it("returns not_found for an unknown task or project", async () => {
		const db = await setup();

		expect(failure(moveTask(db, "SPA-9", "spa")).kind).toBe("not_found");
		const task = unwrap(createTask(db, { project_id: "spa", title: "X" }));
		expect(failure(moveTask(db, task.id, "ghost")).kind).toBe("not_found");
	});
});

describe("task numbering", () => {
	it("does not reuse the number of a deleted task", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(deleteTask(db, first.id));

		const next = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		expect(next.id).toBe("SPA-2");
	});

	it("does not reuse the number of a task moved away", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		unwrap(moveTask(db, first.id, "bil"));

		const next = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		expect(next.id).toBe("SPA-2");
	});

	it("does not reuse a number in the project a task moved out of", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const moved = unwrap(createTask(db, { project_id: "bil", title: "A" }));
		unwrap(moveTask(db, moved.id, "spa"));

		const next = unwrap(createTask(db, { project_id: "bil", title: "B" }));

		expect(next.id).toBe("BIL-2");
	});
});

describe("task moves with links", () => {
	it("remaps links inside the moved subtree", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		const first = unwrap(
			createTask(db, { project_id: "spa", title: "A", epic_id: epic.id }),
		);
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "B", epic_id: epic.id }),
		);
		unwrap(addLink(db, "blocks", second.id, first.id));

		const moved = unwrap(moveTask(db, epic.id, "bil"));

		expect(moved.id).toBe("BIL-1");
		expect(getTask(db, "BIL-2")?.blocked_by).toEqual(["BIL-3"]);
		expect(getTask(db, "BIL-3")?.blocks).toEqual(["BIL-2"]);
	});

	it("keeps a link to a task outside the subtree", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const moved = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const external = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "relates_to", moved.id, external.id));

		const movedTask = unwrap(moveTask(db, moved.id, "bil"));

		expect(getTask(db, movedTask.id)?.relates_to).toEqual([external.id]);
		expect(getTask(db, external.id)?.relates_to).toEqual([movedTask.id]);
	});
});
