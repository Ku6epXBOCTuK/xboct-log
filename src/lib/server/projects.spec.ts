import { describe, expect, it } from "vitest";
import { failure, setup, unwrap } from "./app-test-kit";
import { openMigratedDatabase } from "./migrations";
import {
	createProject,
	getProject,
	listProjects,
	updateProject,
} from "./projects";
import { createTask } from "./tasks";

describe("projects", () => {
	it("creates a project and reads it back", async () => {
		const db = await openMigratedDatabase(":memory:");
		const project = unwrap(
			createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }),
		);

		expect(project).toMatchObject({ id: "spa", name: "Shop", prefix: "SPA" });
		expect(project.archived_at).toBeNull();
		expect(getProject(db, "spa")).toEqual(project);
	});

	it("returns a conflict for a duplicate prefix", async () => {
		const db = await setup();
		const error = failure(
			createProject(db, { id: "other", name: "Other", prefix: "SPA" }),
		);

		expect(error.kind).toBe("conflict");
		expect(error.status).toBe(409);
	});

	it("stores the prefix uppercase and rejects a case-insensitive clash", async () => {
		const db = await setup();
		const project = unwrap(
			createProject(db, { id: "blog", name: "Blog", prefix: "blog" }),
		);

		expect(project.prefix).toBe("BLOG");
		expect(unwrap(createTask(db, { project_id: "blog", title: "A" })).id).toBe(
			"BLOG-1",
		);

		const error = failure(
			createProject(db, { id: "blog2", name: "Blog 2", prefix: "BlOg" }),
		);
		expect(error.kind).toBe("conflict");
	});

	it("blocks a case-variant prefix inserted directly in the database", async () => {
		const db = await setup();

		expect(() =>
			db
				.prepare(
					"INSERT INTO projects (id, name, prefix, created_at) VALUES (?, ?, ?, ?)",
				)
				.run("manual", "Manual", "spa", new Date().toISOString()),
		).toThrow();
	});

	it("blocks a lowercase prefix inserted directly in the database", async () => {
		const db = await setup();

		expect(() =>
			db
				.prepare(
					"INSERT INTO projects (id, name, prefix, created_at) VALUES (?, ?, ?, ?)",
				)
				.run("manual", "Manual", "man", new Date().toISOString()),
		).toThrow(/uppercase/);
	});

	it("returns a validation error for an invalid id", async () => {
		const db = await openMigratedDatabase(":memory:");
		const error = failure(
			createProject(db, { id: "bad id!", name: "Bad", prefix: "BAD" }),
		);

		expect(error.kind).toBe("validation");
		expect(error.message).toContain("latin letters");
	});

	it("rejects a prefix that is not 1-6 letters or digits", async () => {
		const db = await openMigratedDatabase(":memory:");

		for (const prefix of ["A-B", "ABCDEFG", "AB CD"]) {
			const error = failure(
				createProject(db, { id: "shop", name: "Shop", prefix }),
			);
			expect(error.kind).toBe("validation");
			expect(error.message).toContain("1-6");
		}
	});

	it("returns not_found when updating a missing project", async () => {
		const db = await openMigratedDatabase(":memory:");
		const error = failure(updateProject(db, "ghost", { name: "Ghost" }));

		expect(error.kind).toBe("not_found");
	});

	it("archives a project and hides it from the default list", async () => {
		const db = await setup();
		unwrap(updateProject(db, "spa", { archived: true }));

		expect(listProjects(db)).toHaveLength(0);
		expect(listProjects(db, { includeArchived: true })).toHaveLength(1);
	});

	it("renames and restores a project", async () => {
		const db = await setup();
		expect(
			unwrap(updateProject(db, "spa", { archived: true })).archived_at,
		).not.toBeNull();

		expect(
			unwrap(updateProject(db, "spa", { name: " Storefront " })).name,
		).toBe("Storefront");

		const restored = unwrap(updateProject(db, "spa", { archived: false }));
		expect(restored.archived_at).toBeNull();
		expect(listProjects(db)).toHaveLength(1);
	});
});
