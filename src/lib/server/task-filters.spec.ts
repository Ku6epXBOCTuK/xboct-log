import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject, updateProject } from "./projects";
import { createScope } from "./scopes";
import {
	closeTask,
	countTasks,
	createTask,
	deleteTask,
	listTasks,
} from "./tasks";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

describe("task filters", () => {
	let db: DatabaseSync;

	beforeEach(async () => {
		db = await openMigratedDatabase(":memory:");
		unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
		unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
		unwrap(createProject(db, { id: "old", name: "Old", prefix: "OLD" }));
	});

	it("filters by several projects at once", async () => {
		unwrap(createTask(db, { project_id: "spa", title: "Shop task" }));
		unwrap(createTask(db, { project_id: "bil", title: "Billing task" }));
		unwrap(createTask(db, { project_id: "old", title: "Old task" }));

		const found = listTasks(db, { project_id: ["spa", "bil"] });

		expect(found.map((task) => task.title).sort()).toEqual([
			"Billing task",
			"Shop task",
		]);
	});

	it("excludes projects", async () => {
		unwrap(createTask(db, { project_id: "spa", title: "Shop task" }));
		unwrap(createTask(db, { project_id: "bil", title: "Billing task" }));
		unwrap(createTask(db, { project_id: "old", title: "Old task" }));

		const found = listTasks(db, { exclude_project_id: ["old", "bil"] });

		expect(found.map((task) => task.title)).toEqual(["Shop task"]);
	});

	it("combines project inclusion with exclusion", async () => {
		unwrap(createTask(db, { project_id: "spa", title: "Shop task" }));
		unwrap(createTask(db, { project_id: "bil", title: "Billing task" }));

		const found = listTasks(db, {
			project_id: ["spa", "bil"],
			exclude_project_id: "bil",
		});

		expect(found.map((task) => task.title)).toEqual(["Shop task"]);
	});

	it("matches tags case-insensitively", async () => {
		unwrap(
			createTask(db, { project_id: "spa", title: "Tagged", tags: ["mcp"] }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Untagged" }));

		for (const tag of ["MCP", "McP", "mcp"]) {
			const found = listTasks(db, { tag: [tag] });
			expect(found.map((task) => task.title)).toEqual(["Tagged"]);
		}
		const missed = listTasks(db, { tag: ["nope"] });
		expect(missed).toEqual([]);
	});

	it("filters by the presence of tags", async () => {
		unwrap(
			createTask(db, { project_id: "spa", title: "Tagged", tags: ["mcp"] }),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Untagged" }));

		const tagged = listTasks(db, { has_tags: true });
		expect(tagged.map((task) => task.title)).toEqual(["Tagged"]);
		const untagged = listTasks(db, { has_tags: false });
		expect(untagged.map((task) => task.title)).toEqual(["Untagged"]);
	});

	it("filters by several scopes at once", async () => {
		const frontend = unwrap(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		const backend = unwrap(
			createScope(db, { project_id: "spa", name: "backend" }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Front",
				scope_id: frontend.id,
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Back",
				scope_id: backend.id,
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Loose" }));

		const found = listTasks(db, { scope_id: [frontend.id, backend.id] });

		expect(found.map((task) => task.title).sort()).toEqual(["Back", "Front"]);
	});

	it("filters by several epics at once", async () => {
		const first = unwrap(
			createTask(db, { project_id: "spa", title: "Epic one", is_epic: true }),
		);
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Epic two", is_epic: true }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child one",
				epic_id: first.id,
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "Child two",
				epic_id: second.id,
			}),
		);

		const found = listTasks(db, { epic_id: [first.id, second.id] });

		expect(found.map((task) => task.title).sort()).toEqual([
			"Child one",
			"Child two",
		]);
	});

	it("filters by the presence of an epic and of a scope", async () => {
		const scope = unwrap(
			createScope(db, { project_id: "spa", name: "frontend" }),
		);
		const epic = unwrap(
			createTask(db, { project_id: "spa", title: "Epic", is_epic: true }),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "With epic",
				epic_id: epic.id,
				scope_id: scope.id,
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "With scope",
				scope_id: scope.id,
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Bare" }));

		expect(listTasks(db, { has_epic: true }).map((task) => task.title)).toEqual(
			["With epic"],
		);
		expect(
			listTasks(db, { has_epic: false })
				.map((task) => task.title)
				.sort(),
		).toEqual(["Bare", "Epic", "With scope"]);
		expect(
			listTasks(db, { has_scope: true })
				.map((task) => task.title)
				.sort(),
		).toEqual(["With epic", "With scope"]);
		expect(
			listTasks(db, { has_scope: false })
				.map((task) => task.title)
				.sort(),
		).toEqual(["Bare", "Epic"]);
	});

	it("sorts by task number", async () => {
		unwrap(createTask(db, { project_id: "spa", title: "First" }));
		unwrap(createTask(db, { project_id: "spa", title: "Second" }));
		unwrap(createTask(db, { project_id: "spa", title: "Third" }));

		const found = listTasks(db, { sort: "number" });

		expect(found.map((task) => task.number)).toEqual([1, 2, 3]);
		expect(
			listTasks(db, { sort: "number", order: "desc" }).map(
				(task) => task.number,
			),
		).toEqual([3, 2, 1]);
	});

	it("sorts by title", async () => {
		unwrap(createTask(db, { project_id: "spa", title: "banana" }));
		unwrap(createTask(db, { project_id: "spa", title: "Apple" }));
		unwrap(createTask(db, { project_id: "spa", title: "cherry" }));

		const found = listTasks(db, { sort: "title" });

		expect(found.map((task) => task.title)).toEqual([
			"Apple",
			"banana",
			"cherry",
		]);
	});

	it("sorts by the closing date and keeps the open tasks last", async () => {
		const open = unwrap(createTask(db, { project_id: "spa", title: "Open" }));
		const first = unwrap(createTask(db, { project_id: "spa", title: "First" }));
		const second = unwrap(
			createTask(db, { project_id: "spa", title: "Second" }),
		);
		unwrap(closeTask(db, first.id, "fixed"));
		unwrap(closeTask(db, second.id, "fixed"));

		const found = listTasks(db, { sort: "closed_at", order: "asc" });

		expect(found.map((task) => task.title)).toEqual([
			"First",
			"Second",
			"Open",
		]);
		expect(found[0].id).toBe(first.id);
		expect(found[2].id).toBe(open.id);
	});

	it("keeps archived projects out of the excluded set", async () => {
		unwrap(createTask(db, { project_id: "spa", title: "Shop task" }));
		unwrap(createTask(db, { project_id: "old", title: "Old task" }));
		unwrap(updateProject(db, "old", { archived: true }));

		const found = listTasks(db, { exclude_project_id: "old" });

		expect(found.map((task) => task.title)).toEqual(["Shop task"]);
	});

	it("lists only the deleted tasks", async () => {
		const kept = unwrap(createTask(db, { project_id: "spa", title: "Kept" }));
		const removed = unwrap(
			createTask(db, { project_id: "spa", title: "Removed" }),
		);
		unwrap(deleteTask(db, removed.id));

		expect(
			listTasks(db, { deleted_only: true }).map((task) => task.id),
		).toEqual([removed.id]);
		expect(
			listTasks(db, { deleted_only: true }).map((task) => task.id),
		).not.toContain(kept.id);
		expect(countTasks(db, { deleted_only: true })).toBe(1);
		expect(listTasks(db, { include_deleted: true })).toHaveLength(2);
	});

	it("filters by a source file fragment", async () => {
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "From backlog",
				source_file: "docs/backlog.md",
			}),
		);
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "From roadmap",
				source_file: "docs/roadmap.md",
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Without source" }));

		expect(
			listTasks(db, { source_file: "backlog" }).map((task) => task.title),
		).toEqual(["From backlog"]);
		expect(
			listTasks(db, { source_file: "BACKLOG" }).map((task) => task.title),
		).toEqual(["From backlog"]);
		expect(
			listTasks(db, { source_file: "docs/" })
				.map((task) => task.title)
				.sort(),
		).toEqual(["From backlog", "From roadmap"]);
	});
});
