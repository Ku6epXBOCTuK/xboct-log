import { describe, expect, it } from "vitest";
import { failure, setup, unwrap } from "../app-test-kit";
import { addLink, removeLink } from "../links";
import { createTask, getTask } from "../tasks";

describe("task relations", () => {
	it("stores relates_to once and reads it from both tasks", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		unwrap(addLink(db, "relates_to", first.id, second.id));

		expect(getTask(db, first.id)?.relates_to).toEqual([second.id]);
		expect(getTask(db, second.id)?.relates_to).toEqual([first.id]);
	});

	it("is idempotent for a symmetric relates_to link", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "relates_to", first.id, second.id));

		unwrap(addLink(db, "relates_to", second.id, first.id));

		expect(getTask(db, first.id)?.relates_to).toEqual([second.id]);
	});

	it("reads duplicates only in the stored direction", async () => {
		const db = await setup();
		const duplicate = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const original = unwrap(createTask(db, { project_id: "spa", title: "B" }));

		unwrap(addLink(db, "duplicates", duplicate.id, original.id));

		expect(getTask(db, duplicate.id)?.duplicates).toEqual([original.id]);
		expect(getTask(db, duplicate.id)?.duplicated_by).toEqual([]);
		expect(getTask(db, original.id)?.duplicates).toEqual([]);
		expect(getTask(db, original.id)?.duplicated_by).toEqual([duplicate.id]);
	});

	it("rejects a self link and a duplicates cycle", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "duplicates", first.id, second.id));

		expect(failure(addLink(db, "relates_to", first.id, first.id)).kind).toBe(
			"validation",
		);
		const error = failure(addLink(db, "duplicates", second.id, first.id));
		expect(error.kind).toBe("conflict");
		expect(error.message).toContain("cycle");
	});

	it("removes a link and reports a missing one", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		unwrap(addLink(db, "relates_to", first.id, second.id));

		unwrap(removeLink(db, "relates_to", first.id, second.id));

		expect(getTask(db, first.id)?.relates_to).toEqual([]);
		expect(
			failure(removeLink(db, "relates_to", first.id, second.id)).kind,
		).toBe("not_found");
	});
});
