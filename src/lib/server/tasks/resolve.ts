import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import { invalid, notFound, type AppError } from "../errors";
import { resolveProjectRef } from "../projects";

interface EpicRow {
	id: string;
	project_id: string;
	is_epic: number;
	deleted_at: string | null;
}

export const TASK_NUMBER_PATTERN = /^\d+$/;

export function normalizeTaskIdInput(id: string): string {
	const dash = id.lastIndexOf("-");
	if (dash <= 0) {
		return id;
	}
	const number = id.slice(dash + 1);
	if (!TASK_NUMBER_PATTERN.test(number)) {
		return id;
	}
	return `${id.slice(0, dash).toUpperCase()}-${number}`;
}

export function taskIdCandidates(id: string): string[] {
	const candidates = [id];
	const normalized = normalizeTaskIdInput(id);
	if (normalized !== id) {
		candidates.push(normalized);
	}
	return candidates;
}

function hasEpicAncestor(
	db: DatabaseSync,
	epicId: string,
	ancestorId: string,
): boolean {
	const seen = new Set<string>([epicId]);
	let cursor = epicId;
	while (true) {
		const parent = db
			.prepare("SELECT epic_id FROM tasks WHERE id = ?")
			.get(cursor) as { epic_id: string | null } | undefined;
		const next = parent?.epic_id ?? null;
		if (next === null || seen.has(next)) {
			return false;
		}
		if (next === ancestorId) {
			return true;
		}
		seen.add(next);
		cursor = next;
	}
}

export function resolveEpicId(
	db: DatabaseSync,
	input: string,
	projectId: string,
	selfId?: string,
): Result<string, AppError> {
	const trimmed = input.trim();
	if (TASK_NUMBER_PATTERN.test(trimmed)) {
		const candidates = (
			db
				.prepare(
					"SELECT id FROM tasks WHERE number = ? AND project_id = ? AND is_epic = 1 AND deleted_at IS NULL ORDER BY id",
				)
				.all(Number(trimmed), projectId) as { id: string }[]
		).map((row) => row.id);
		return err(
			invalid(
				candidates.length > 0
					? `epic id must be 'PREFIX-NUMBER' — use ${candidates.join(", ")}`
					: `epic id must be 'PREFIX-NUMBER' — no epic ${trimmed} in project ${projectId}`,
			),
		);
	}
	let row: EpicRow | undefined;
	for (const candidate of taskIdCandidates(trimmed)) {
		const found = db
			.prepare(
				"SELECT id, project_id, is_epic, deleted_at FROM tasks WHERE id = ?",
			)
			.get(candidate) as EpicRow | undefined;
		if (found && found.deleted_at === null) {
			row = found;
			break;
		}
	}
	if (!row) {
		return err(notFound(`epic ${trimmed} not found`));
	}
	if (selfId !== undefined && row.id === selfId) {
		return err(invalid("a task cannot be its own epic"));
	}
	if (selfId !== undefined && hasEpicAncestor(db, row.id, selfId)) {
		return err(invalid("setting this epic would create a cycle"));
	}
	if (row.is_epic !== 1) {
		return err(invalid(`${row.id} is not an epic`));
	}
	if (row.project_id !== projectId) {
		return err(invalid("epic must belong to the same project"));
	}
	return ok(row.id);
}

export function validateScope(
	db: DatabaseSync,
	scopeId: number,
	projectId: string,
): AppError | null {
	const scope = db
		.prepare("SELECT project_id FROM scopes WHERE id = ?")
		.get(scopeId) as { project_id: string } | undefined;
	if (!scope) {
		return notFound(`scope ${scopeId} not found`);
	}
	if (scope.project_id !== projectId) {
		return invalid("scope must belong to the same project");
	}
	return null;
}

export function idsByNumber(
	db: DatabaseSync,
	number: number,
	includeDeleted = false,
): string[] {
	const alive = includeDeleted ? "" : " AND deleted_at IS NULL";
	const rows = db
		.prepare(
			`SELECT id FROM tasks WHERE number = ?${alive} ORDER BY project_id, id`,
		)
		.all(number) as { id: string }[];
	return rows.map((row) => row.id);
}

interface TaskRefRow {
	id: string;
	project_id: string;
}

export function lookupTask(
	db: DatabaseSync,
	id: string,
	includeDeleted = false,
): TaskRefRow | undefined {
	const alive = includeDeleted ? "" : " AND deleted_at IS NULL";
	for (const candidate of taskIdCandidates(id)) {
		const found = db
			.prepare(`SELECT id, project_id FROM tasks WHERE id = ?${alive}`)
			.get(candidate) as TaskRefRow | undefined;
		if (found) {
			return found;
		}
	}
	return undefined;
}

function nearTaskIds(
	db: DatabaseSync,
	projectId: string,
	number: number,
): string[] {
	const rows = db
		.prepare(
			`SELECT id FROM tasks
			 WHERE project_id = ? AND number BETWEEN ? AND ? AND deleted_at IS NULL
			 ORDER BY ABS(number - ?) LIMIT 3`,
		)
		.all(projectId, number - 3, number + 3, number) as { id: string }[];
	return rows.map((row) => row.id);
}

function hintForFullId(db: DatabaseSync, id: string): string | undefined {
	const dash = id.lastIndexOf("-");
	if (dash <= 0) {
		return undefined;
	}
	const prefix = id.slice(0, dash);
	const number = id.slice(dash + 1);
	if (!TASK_NUMBER_PATTERN.test(number)) {
		return undefined;
	}
	const project = resolveProjectRef(db, prefix);
	if (!project) {
		const prefixes = (
			db.prepare("SELECT prefix FROM projects ORDER BY prefix").all() as {
				prefix: string;
			}[]
		).map((row) => row.prefix);
		return prefixes.length > 0
			? `unknown project prefix '${prefix}' (known: ${prefixes.join(", ")})`
			: undefined;
	}
	const near = nearTaskIds(db, project.id, Number(number));
	return near.length > 0 ? `did you mean ${near.join(" or ")}?` : undefined;
}

export function resolveTaskId(
	db: DatabaseSync,
	input: string,
): Result<string, AppError> {
	return resolveTaskIdInternal(db, input, false);
}

export function resolveTaskIdInternal(
	db: DatabaseSync,
	input: string,
	includeDeleted: boolean,
): Result<string, AppError> {
	const trimmed = input.trim();
	if (TASK_NUMBER_PATTERN.test(trimmed)) {
		const candidates = idsByNumber(db, Number(trimmed), includeDeleted);
		return err(
			invalid(
				candidates.length > 0
					? `task id must be 'PREFIX-NUMBER' — use ${candidates.join(", ")}`
					: `task id must be 'PREFIX-NUMBER' — no task ${trimmed} in the backlog`,
			),
		);
	}
	const found = lookupTask(db, trimmed, includeDeleted);
	if (!found) {
		const hint = hintForFullId(db, trimmed);
		return err(
			notFound(`task ${trimmed} not found${hint ? ` — ${hint}` : ""}`),
		);
	}
	return ok(found.id);
}
