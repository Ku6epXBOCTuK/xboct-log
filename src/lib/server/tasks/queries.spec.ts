import { describe, expect, it } from "vitest";
import { setup, unwrap } from "../app-test-kit";
import { createProject, updateProject } from "../projects";
import { createScope } from "../scopes";
import { statusCounts } from "../status-counts-test-kit";
import {
	countEpicsByStatus,
	countTasks,
	countTasksByStatus,
	createTask,
	deleteTask,
	getTasksByIds,
	listTasks,
	updateTask,
} from "../tasks";
import { SHORT_DESCRIPTION_LENGTH } from "../tasks/rows";

describe("task queries", () => {
	it("filters by status, tag and text", async () => {
		const db = await setup();
		const alpha = unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "Alpha bug",
				tags: ["perf"],
			}),
		);
		const beta = unwrap(
			createTask(db, { project_id: "spa", title: "Beta", tags: ["a11y"] }),
		);
		unwrap(updateTask(db, beta.id, { status: "done" }));

		expect(listTasks(db, { status: ["open"] })).toHaveLength(1);
		expect(listTasks(db, { tag: ["a11y"] })).toHaveLength(1);
		expect(listTasks(db, { q: "alpha" })).toHaveLength(1);
		expect(listTasks(db, { q: alpha.id })).toHaveLength(1);
		expect(listTasks(db, { q: "a11y" })).toHaveLength(1);
		expect(listTasks(db, { q: "perf" })).toHaveLength(1);
		expect(listTasks(db, { project_id: "spa" })).toHaveLength(2);
	});

	it("finds tasks by the id of their epic", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);

		expect(listTasks(db, { q: epic.id })).toHaveLength(2);
		expect(listTasks(db, { q: "Revamp" })).toHaveLength(1);
	});

	it("counts all matches ignoring limit and offset", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));
		unwrap(createTask(db, { project_id: "spa", title: "Beta" }));
		unwrap(createTask(db, { project_id: "spa", title: "Gamma" }));

		expect(countTasks(db, { project_id: "spa" })).toBe(3);
		expect(countTasks(db, { q: "a" })).toBe(3);
		expect(listTasks(db, { project_id: "spa", limit: 1 })).toHaveLength(1);
		expect(countTasks(db, { project_id: "spa", limit: 1, offset: 1 })).toBe(3);
		expect(countTasks(db, { project_id: "spa", q: "alpha" })).toBe(1);
	});

	it("filters epics and their children", async () => {
		const db = await setup();
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Revamp", is_epic: true }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child",
				epic_id: epic.id,
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Loose" }));

		expect(listTasks(db, { is_epic: true }).map((task) => task.id)).toEqual([
			epic.id,
		]);
		expect(listTasks(db, { is_epic: false })).toHaveLength(2);
		expect(
			listTasks(db, { epic_id: epic.id }).map((task) => task.title),
		).toEqual(["Child"]);
	});

	it("returns requested tasks in order and lists missing ids", async () => {
		const db = await setup();
		const first = unwrap(createTask(db, { project_id: "spa", title: "A" }));
		const second = unwrap(createTask(db, { project_id: "spa", title: "B" }));
		const gone = unwrap(createTask(db, { project_id: "spa", title: "Gone" }));
		unwrap(deleteTask(db, gone.id));

		const result = getTasksByIds(db, [second.id, first.id, "SPA-9", gone.id]);

		expect(result.items.map((task) => task.id)).toEqual([second.id, first.id]);
		expect(result.missing).toEqual(["SPA-9", gone.id]);
	});

	it("attaches project names without hiding archived projects", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));
		unwrap(createProject(db, { id: "old", name: "Old", prefix: "OLD" }));
		unwrap(createTask(db, { project_id: "old", title: "Legacy" }));
		unwrap(updateProject(db, "old", { archived: true }));

		const withNames = listTasks(db, { include_project: true });

		expect(withNames.map((task) => task.project_name).sort()).toEqual([
			"Old",
			"Shop",
		]);
		expect(
			listTasks(db, { project_archived: false }).map((task) => task.title),
		).toEqual(["Alpha"]);
		expect(
			listTasks(db, { project_archived: true }).map((task) => task.title),
		).toEqual(["Legacy"]);
	});

	it("omits project_name unless the project is joined", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));

		const [task] = listTasks(db, { fields: "id,project_name" });

		expect(Object.keys(task)).toEqual(["id", "project_id", "number"]);
	});

	it("attaches scope names when requested", async () => {
		const db = await setup();
		const scope = unwrap(createScope(db, { project_id: "spa", name: "ux" }));
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				scope_id: scope.id,
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Beta" }));

		const tasks = listTasks(db, { include_scope: true });

		expect(tasks.find((task) => task.title === "Alpha")?.scope_name).toBe("ux");
		expect(
			tasks.find((task) => task.title === "Beta")?.scope_name,
		).toBeUndefined();
	});

	it("keeps filters unambiguous when scopes and projects are joined", async () => {
		const db = await setup();
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		const scope = unwrap(createScope(db, { project_id: "spa", name: "ux" }));
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				scope_id: scope.id,
			}),
		);
		unwrap(createTask(db, { project_id: "bil", title: "Beta" }));

		const joined = listTasks(db, {
			project_id: "spa",
			include_scope: true,
			include_project: true,
			include_description: true,
		});

		expect(joined.map((task) => task.title)).toEqual(["Alpha"]);
		expect(
			listTasks(db, { project_id: "spa", include_scope: true, q: "Alpha" }),
		).toHaveLength(1);
		expect(
			listTasks(db, { scope_id: scope.id, include_scope: true }).map(
				(task) => task.title,
			),
		).toEqual(["Alpha"]);
		expect(countTasks(db, { project_id: "spa", include_scope: true })).toBe(1);
	});

	it("limits the response to the requested fields", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));

		const found = listTasks(db, {
			title: "alpha",
			fields: "id,number,title,status,project_id,updated_at",
		});

		expect(found).toHaveLength(1);
		expect(Object.keys(found[0]).sort()).toEqual([
			"id",
			"number",
			"project_id",
			"status",
			"title",
			"updated_at",
		]);
	});

	it("ignores unknown field names", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "Alpha" }));

		const [task] = listTasks(db, { fields: "id,bogus" });

		expect(Object.keys(task)).toEqual(["id", "project_id", "number"]);
		expect(listTasks(db, { fields: "bogus" }).map((item) => item.id)).toEqual([
			"SPA-1",
		]);
	});

	it("returns short_description instead of the full description by default", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				description: "first line\nsecond line",
			}),
		);

		const [task] = listTasks(db, { title: "alpha" });

		expect(task.description).toBeUndefined();
		expect(task.short_description).toBe("first line");
	});

	it("includes the full description when asked", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				description: "first line\nsecond line",
			}),
		);

		const [task] = listTasks(db, {
			title: "alpha",
			include_description: true,
		});

		expect(task.description).toBe("first line\nsecond line");
		expect(task.short_description).toBeUndefined();
	});

	it("keeps the full description when fields request it", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Alpha",
				description: "line one\nline two",
			}),
		);

		const [task] = listTasks(db, {
			title: "alpha",
			fields: "id,description",
		});

		expect(task.description).toBe("line one\nline two");
	});

	it("truncates a long short_description and handles an empty one", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Long",
				description: "x".repeat(200),
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Empty" }));

		const [longTask] = listTasks(db, { title: "Long" });
		const [emptyTask] = listTasks(db, { title: "Empty" });

		expect(longTask.short_description).toHaveLength(
			SHORT_DESCRIPTION_LENGTH + 1,
		);
		expect(longTask.short_description?.endsWith("…")).toBe(true);
		expect(emptyTask.short_description).toBe("");
	});

	it("sorts by priority severity, most severe first", async () => {
		const db = await setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "Low", priority: "low" }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Critical",
				priority: "critical",
			}),
		);
		unwrap(
			createTask(db, { project_id: "spa", title: "High", priority: "high" }),
		);

		expect(listTasks(db, { sort: "priority" }).map((t) => t.priority)).toEqual([
			"critical",
			"high",
			"low",
		]);
	});

	it("counts tasks by status", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "A", status: "open" }));
		const b = unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "B",
				priority: "high",
			}),
		);
		unwrap(updateTask(db, b.id, { status: "blocked" }));
		unwrap(createTask(db, { project_id: "spa", title: "C" }));

		expect(countTasksByStatus(db, "spa")).toEqual(
			statusCounts({ backlog: 1, open: 1, blocked: 1 }),
		);
	});

	it("counts tasks and epics by status separately", async () => {
		const db = await setup();
		unwrap(
			createTask(db, { project_id: "spa", title: "Task", status: "open" }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Epic",
				status: "open",
				is_epic: true,
			}),
		);
		const done = unwrap(
			createTask(db, { project_id: "spa", title: "Done", is_epic: true }),
		);
		unwrap(updateTask(db, done.id, { status: "done" }));

		expect(countTasksByStatus(db, "spa")).toEqual(statusCounts({ open: 1 }));
		expect(countEpicsByStatus(db, "spa")).toEqual(
			statusCounts({ open: 1, done: 1 }),
		);
	});
});
