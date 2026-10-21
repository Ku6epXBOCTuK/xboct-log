import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject, updateProject } from "./projects";
import { createScope } from "./scopes";
import { createTask, listTasks } from "./tasks";

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

	it("keeps archived projects out of the excluded set", async () => {
		unwrap(createTask(db, { project_id: "spa", title: "Shop task" }));
		unwrap(createTask(db, { project_id: "old", title: "Old task" }));
		unwrap(updateProject(db, "old", { archived: true }));

		const found = listTasks(db, { exclude_project_id: "old" });

		expect(found.map((task) => task.title)).toEqual(["Shop task"]);
	});
});
