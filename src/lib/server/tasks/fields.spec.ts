import { describe, expect, it } from "vitest";
import { failure, setup, unwrap } from "../app-test-kit";
import { createTask, getTask, listTasks, updateTask } from "../tasks";

describe("task fields", () => {
	it("generates sequential ids per project", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "First" }));
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Second" }),
		);

		expect(first.id).toBe("SPA-1");
		expect(second.id).toBe("SPA-2");
		expect(first.number).toBe(1);
	});

	it("applies defaults and round-trips arrays and source", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Fix checkout",
				tags: ["perf", "perf", " checkout "],
				source_file: "src/cart.ts",
			}),
		);

		expect(task.status).toBe("backlog");
		expect(task.priority).toBe("medium");
		expect(task.tags).toEqual(["checkout", "perf"]);
		expect(task.source_file).toBe("src/cart.ts");
		expect(task.closed_at).toBeNull();
		expect(getTask(db, task.id)).toEqual(task);
	});

	it("stores the estimate and rejects an unknown one", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "Small", estimate: "S" }),
		);

		expect(task.estimate).toBe("S");

		const error = failure(
			createTask(db, {
				project_id: "spa",
				title: "Wrong",
				estimate: "XL" as never,
			}),
		);
		expect(error.kind).toBe("validation");
	});

	it("changes and clears the estimate", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Sized" }));
		expect(task.estimate).toBeNull();

		const updated = unwrap(updateTask(db, task.id, { estimate: "L" }));
		expect(updated.estimate).toBe("L");

		const cleared = unwrap(updateTask(db, task.id, { estimate: null }));
		expect(cleared.estimate).toBeNull();
	});

	it("filters tasks by estimate", async () => {
		const db = await setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "Small", estimate: "S" }),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "Medium", estimate: "M" }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Unmeasured" }));

		const small = listTasks(db, { estimate: ["S"] });
		expect(small.map((task) => task.title)).toEqual(["Small"]);

		const both = listTasks(db, { estimate: ["S", "M"] });
		expect(both.map((task) => task.title).sort()).toEqual(["Medium", "Small"]);
	});

	it("stores the assignee and the due date", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Owned",
				assignee: "Ann",
				due_at: "2026-10-30",
			}),
		);

		expect(task.assignee).toBe("Ann");
		expect(task.due_at).toBe("2026-10-30");
	});

	it("cuts a full timestamp to the day and rejects an impossible date", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Stamped",
				due_at: "2026-10-30T18:45:00Z",
			}),
		);

		expect(task.due_at).toBe("2026-10-30");

		const error = failure(
			createTask(db, {
				project_id: "spa",
				title: "Broken",
				due_at: "2026-13-40",
			}),
		);
		expect(error.kind).toBe("validation");
	});

	it("changes and clears the assignee and the due date", async () => {
		const db = await setup();
		const task = unwrap(createTask(db, { project_id: "spa", title: "Owned" }));

		const updated = unwrap(
			updateTask(db, task.id, { assignee: "Bob", due_at: "2026-11-01" }),
		);
		expect(updated.assignee).toBe("Bob");
		expect(updated.due_at).toBe("2026-11-01");

		const cleared = unwrap(
			updateTask(db, task.id, { assignee: null, due_at: null }),
		);
		expect(cleared.assignee).toBeNull();
		expect(cleared.due_at).toBeNull();
	});

	it("filters tasks by assignee and due date", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Soon",
				assignee: "Ann",
				due_at: "2026-10-20",
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Later",
				assignee: "Bob",
				due_at: "2026-11-20",
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Nobody" }));

		expect(
			listTasks(db, { assignee: ["ann"] }).map((task) => task.title),
		).toEqual(["Soon"]);
		expect(
			listTasks(db, { due_before: "2026-11-01" }).map((task) => task.title),
		).toEqual(["Soon"]);
		expect(
			listTasks(db, { due_after: "2026-11-01" }).map((task) => task.title),
		).toEqual(["Later"]);
	});
});
