import type { Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { expect } from "vitest";
import type { AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import { ensureTag } from "./tasks";

export function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

export function failure(result: Result<unknown, AppError>): AppError {
	expect(result.isErr()).toBe(true);
	return result._unsafeUnwrapErr();
}

export async function setup(): Promise<DatabaseSync> {
	const db = await openMigratedDatabase(":memory:");
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
	for (const tag of ["perf", "checkout", "x", "a11y"]) {
		unwrap(ensureTag(db, tag));
	}
	return db;
}
