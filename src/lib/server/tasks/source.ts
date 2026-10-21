import type { DatabaseSync } from "node:sqlite";
import { err, type Result } from "neverthrow";
import { conflict, type AppError } from "../errors";

export function isUniqueViolation(error: unknown): boolean {
	return (
		error instanceof Error && error.message.includes("UNIQUE constraint failed")
	);
}

export function taskAtSourceLocation(
	db: DatabaseSync,
	projectId: string,
	sourceFile: string | null,
	sourceLine: number | null,
): string | null {
	if (sourceFile === null || sourceLine === null) {
		return null;
	}
	const row = db
		.prepare(
			`SELECT id FROM tasks
			 WHERE project_id = ? AND source_file = ? AND source_line = ?`,
		)
		.get(projectId, sourceFile, sourceLine) as { id: string } | undefined;
	return row ? row.id : null;
}

export function sourceLocationConflict(
	db: DatabaseSync,
	projectId: string,
	sourceFile: string | null,
	sourceLine: number | null,
): AppError | null {
	const existing = taskAtSourceLocation(db, projectId, sourceFile, sourceLine);
	if (existing === null) {
		return null;
	}
	return conflict(
		`a task at ${sourceFile}:${sourceLine} already exists in project ${projectId} (${existing})`,
	);
}

export function withSourceConflict<T>(
	result: Result<T, AppError>,
	db: DatabaseSync,
	projectId: string,
	sourceFile: string | null,
	sourceLine: number | null,
): Result<T, AppError> {
	if (!result.isErr() || !isUniqueViolation(result.error)) {
		return result;
	}
	const existing = sourceLocationConflict(
		db,
		projectId,
		sourceFile,
		sourceLine,
	);
	return existing ? err(existing) : result;
}
