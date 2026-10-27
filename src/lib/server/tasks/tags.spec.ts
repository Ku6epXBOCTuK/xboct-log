import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AppError } from "../errors";
import { openMigratedDatabase } from "../migrations";
import { createProject } from "../projects";
import {
	createTask,
	deleteTask,
	ensureTag,
	getTask,
	listDictionary,
	listTags,
	renameTag,
	setTagArchived,
	validateTags,
} from "./index";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

async function setup(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	unwrap(createProject(db, { id: "bil", name: "Billing", prefix: "BIL" }));
	unwrap(ensureTag(db, "mcp"));
	unwrap(ensureTag(db, "ui"));
	return db;
}

describe("listTags", () => {
	it("counts the tasks per tag, most used first", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "One",
				tags: ["mcp", "ui"],
			}),
		);
		unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "Two",
				tags: ["mcp"],
			}),
		);
		unwrap(createTask(db, { project_id: "spa", title: "Three" }));

		expect(listTags(db)).toEqual([
			{ tag: "mcp", count: 2, active: 2 },
			{ tag: "ui", count: 1, active: 1 },
		]);
	});

	it("filters by project", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "One",
				tags: ["mcp"],
			}),
		);
		unwrap(
			createTask(db, {
				status: "open",
				project_id: "bil",
				title: "Two",
				tags: ["ui"],
			}),
		);

		expect(listTags(db, { project_id: "bil" })).toEqual([
			{ tag: "ui", count: 1, active: 1 },
		]);
		expect(listTags(db, { project_id: ["spa", "bil"] })).toEqual([
			{ tag: "mcp", count: 1, active: 1 },
			{ tag: "ui", count: 1, active: 1 },
		]);
	});

	it("filters by status", async () => {
		const db = await setup();
		unwrap(
			createTask(db, {
				project_id: "spa",
				title: "One",
				tags: ["mcp"],
				status: "done",
			}),
		);
		unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "Two",
				tags: ["mcp"],
			}),
		);

		expect(listTags(db, { status: ["done"] })).toEqual([
			{ tag: "mcp", count: 1, active: 0 },
		]);
		expect(listTags(db, { status: ["open"] })).toEqual([
			{ tag: "mcp", count: 1, active: 1 },
		]);
	});

	it("counts a backlog task as inactive", async () => {
		const db = await setup();
		unwrap(createTask(db, { project_id: "spa", title: "One", tags: ["mcp"] }));
		unwrap(
			createTask(db, {
				status: "open",
				project_id: "spa",
				title: "Two",
				tags: ["mcp"],
			}),
		);

		expect(listTags(db)).toEqual([{ tag: "mcp", count: 2, active: 1 }]);
	});

	it("ignores soft-deleted tasks", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, { project_id: "spa", title: "One", tags: ["mcp"] }),
		);
		unwrap(deleteTask(db, task.id));

		expect(listTags(db)).toEqual([]);
	});
});

describe("tag dictionary", () => {
	it("creates a tag once and lowercases the name", async () => {
		const db = await setup();
		const tag = unwrap(ensureTag(db, "  UX "));

		expect(tag.name).toBe("ux");
		expect(unwrap(ensureTag(db, "ux")).created_at).toBe(tag.created_at);
		expect(listDictionary(db).map((entry) => entry.name)).toEqual([
			"mcp",
			"ui",
			"ux",
		]);
	});

	it("rejects an unknown tag on create with the available ones", async () => {
		const db = await setup();

		const result = createTask(db, {
			project_id: "spa",
			title: "Unknown",
			tags: ["ghost"],
		});

		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().message).toContain(
			"unknown tag(s): ghost",
		);
		expect(result._unsafeUnwrapErr().message).toContain("mcp");
	});

	it("rejects an archived tag", async () => {
		const db = await setup();
		unwrap(setTagArchived(db, "ui", true));

		expect(validateTags(db, ["ui"])?.message).toContain("Archived: ui");
	});

	it("renames a tag on the dictionary and on the tasks", async () => {
		const db = await setup();
		const task = unwrap(
			createTask(db, {
				project_id: "spa",
				title: "One",
				tags: ["mcp", "ui"],
			}),
		);

		unwrap(renameTag(db, "ui", "design"));

		expect(
			listTags(db)
				.map((entry) => entry.tag)
				.sort(),
		).toEqual(["design", "mcp"]);
		expect(getTask(db, task.id)?.tags).toEqual(["mcp", "design"]);
		expect(validateTags(db, ["design"])).toBeNull();
		expect(validateTags(db, ["ui"])).not.toBeNull();
	});

	it("accepts only ascii names with dashes and underscores", async () => {
		const db = await setup();

		expect(ensureTag(db, "баг").isErr()).toBe(true);
		expect(ensureTag(db, "a b").isErr()).toBe(true);
		expect(ensureTag(db, "a.b").isErr()).toBe(true);
		expect(ensureTag(db, "-lead").isErr()).toBe(true);
		expect(ensureTag(db, "a".repeat(21)).isErr()).toBe(true);
		expect(unwrap(ensureTag(db, "quality-of-life_2")).name).toBe(
			"quality-of-life_2",
		);
		expect(renameTag(db, "ui", "баг").isErr()).toBe(true);
	});

	it("restores an archived tag instead of creating a duplicate", async () => {
		const db = await setup();
		unwrap(setTagArchived(db, "ui", true));
		const restored = unwrap(ensureTag(db, "ui"));

		expect(restored.archived).toBe(false);
		expect(validateTags(db, ["ui"])).toBeNull();
	});
});
