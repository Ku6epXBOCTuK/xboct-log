import { err, ok, type Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import type { Scope } from "../types";
import { AppError, conflict, guard, invalid, notFound } from "./errors";
import { getProject } from "./projects";

interface ScopeRow {
	id: number;
	project_id: string;
	name: string;
	created_at: string;
}

export interface NewScope {
	project_id: string;
	name: string;
}

export interface ScopePatch {
	name?: string;
}

function mapScope(row: ScopeRow): Scope {
	return {
		id: row.id,
		project_id: row.project_id,
		name: row.name,
		created_at: row.created_at,
	};
}

export function getScope(db: DatabaseSync, id: number): Scope | undefined {
	const row = db
		.prepare("SELECT * FROM scopes WHERE id = ?")
		.get(id) as unknown as ScopeRow | undefined;
	return row ? mapScope(row) : undefined;
}

export function listScopes(db: DatabaseSync, projectId?: string): Scope[] {
	const rows =
		projectId === undefined
			? (db
					.prepare("SELECT * FROM scopes ORDER BY project_id, name")
					.all() as unknown as ScopeRow[])
			: (db
					.prepare("SELECT * FROM scopes WHERE project_id = ? ORDER BY name")
					.all(projectId) as unknown as ScopeRow[]);
	return rows.map(mapScope);
}

export function scopedProjectIds(db: DatabaseSync): string[] {
	const rows = db
		.prepare("SELECT DISTINCT project_id FROM scopes")
		.all() as unknown as { project_id: string }[];
	return rows.map((row) => row.project_id);
}

export interface ScopeTaskCount {
	tasks: number;
	epics: number;
}

export function countTasksByScope(
	db: DatabaseSync,
	projectId?: string,
): Record<number, ScopeTaskCount> {
	const where = ["scope_id IS NOT NULL", "deleted_at IS NULL"];
	const params: string[] = [];
	if (projectId !== undefined) {
		where.push("project_id = ?");
		params.push(projectId);
	}
	const rows = db
		.prepare(
			`SELECT scope_id,
				SUM(CASE WHEN is_epic = 0 AND status NOT IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS tasks,
				SUM(CASE WHEN is_epic = 1 THEN 1 ELSE 0 END) AS epics
			 FROM tasks
			 WHERE ${where.join(" AND ")}
			 GROUP BY scope_id`,
		)
		.all(...params) as { scope_id: number; tasks: number; epics: number }[];

	const counts: Record<number, ScopeTaskCount> = {};
	for (const row of rows) {
		counts[row.scope_id] = { tasks: row.tasks, epics: row.epics };
	}
	return counts;
}

function nameConflict(
	db: DatabaseSync,
	projectId: string,
	name: string,
	exceptId: number | null,
): boolean {
	const row = db
		.prepare(
			"SELECT id FROM scopes WHERE project_id = ? AND name = ? AND id IS NOT ?",
		)
		.get(projectId, name, exceptId) as { id: number } | undefined;
	return row !== undefined;
}

export function createScope(
	db: DatabaseSync,
	input: NewScope,
): Result<Scope, AppError> {
	const name = input.name?.trim() ?? "";
	if (!name) {
		return err(invalid("scope name is required"));
	}
	if (!getProject(db, input.project_id)) {
		return err(notFound(`project ${input.project_id} not found`));
	}
	if (nameConflict(db, input.project_id, name, null)) {
		return err(conflict(`scope "${name}" already exists`));
	}

	const createdAt = new Date().toISOString();
	return guard(() => {
		const result = db
			.prepare(
				"INSERT INTO scopes (project_id, name, created_at) VALUES (?, ?, ?)",
			)
			.run(input.project_id, name, createdAt);
		return getScope(db, Number(result.lastInsertRowid))!;
	});
}

export function updateScope(
	db: DatabaseSync,
	id: number,
	patch: ScopePatch,
): Result<Scope, AppError> {
	const current = getScope(db, id);
	if (!current) {
		return err(notFound(`scope ${id} not found`));
	}

	if (patch.name === undefined) {
		return ok(current);
	}

	const name = patch.name.trim();
	if (!name) {
		return err(invalid("scope name is required"));
	}
	if (nameConflict(db, current.project_id, name, id)) {
		return err(conflict(`scope "${name}" already exists`));
	}

	return guard(() => {
		db.prepare("UPDATE scopes SET name = ? WHERE id = ?").run(name, id);
		return getScope(db, id)!;
	});
}

export function deleteScope(
	db: DatabaseSync,
	id: number,
): Result<number, AppError> {
	if (!getScope(db, id)) {
		return err(notFound(`scope ${id} not found`));
	}

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			db.prepare("UPDATE tasks SET scope_id = NULL WHERE scope_id = ?").run(id);
			db.prepare("DELETE FROM scopes WHERE id = ?").run(id);
			db.exec("COMMIT");
			return id;
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}
