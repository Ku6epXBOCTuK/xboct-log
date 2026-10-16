import { err, ok, type Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { INBOX_PROJECT_ID, INBOX_PROJECT_PREFIX, type Project } from "../types";
import { AppError, conflict, guard, invalid, notFound } from "./errors";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

interface ProjectRow {
	id: string;
	name: string;
	prefix: string;
	created_at: string;
	archived_at: string | null;
}

export interface NewProject {
	id: string;
	name: string;
	prefix: string;
}

export interface ProjectPatch {
	name?: string;
	archived?: boolean;
}

export interface ListProjectsOptions {
	includeArchived?: boolean;
}

function mapProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		prefix: row.prefix,
		created_at: row.created_at,
		archived_at: row.archived_at,
	};
}

function projectById(db: DatabaseSync, id: string): Project | undefined {
	const row = db
		.prepare("SELECT * FROM projects WHERE id = ?")
		.get(id) as unknown as ProjectRow | undefined;
	return row ? mapProject(row) : undefined;
}

export function createProject(
	db: DatabaseSync,
	input: NewProject,
): Result<Project, AppError> {
	const id = input.id?.trim() ?? "";
	const name = input.name?.trim() ?? "";
	const prefix = input.prefix?.trim() ?? "";

	if (!ID_PATTERN.test(id)) {
		return err(
			invalid("project id must contain only latin letters, digits or dashes"),
		);
	}
	if (!name) {
		return err(invalid("project name is required"));
	}
	if (!prefix) {
		return err(invalid("project prefix is required"));
	}

	const clash = db
		.prepare("SELECT 1 FROM projects WHERE id = ? OR prefix = ? LIMIT 1")
		.get(id, prefix);
	if (clash) {
		return err(conflict("project id or prefix already exists"));
	}

	const createdAt = new Date().toISOString();
	return guard(() => {
		db.prepare(
			"INSERT INTO projects (id, name, prefix, created_at) VALUES (?, ?, ?, ?)",
		).run(id, name, prefix, createdAt);
		return projectById(db, id)!;
	});
}

export function ensureInbox(db: DatabaseSync): Project {
	const existing = projectById(db, INBOX_PROJECT_ID);
	if (existing) {
		if (existing.archived_at !== null) {
			db.prepare("UPDATE projects SET archived_at = NULL WHERE id = ?").run(
				INBOX_PROJECT_ID,
			);
			return projectById(db, INBOX_PROJECT_ID)!;
		}
		return existing;
	}

	const clash = db
		.prepare("SELECT id, name FROM projects WHERE prefix = ?")
		.get(INBOX_PROJECT_PREFIX) as unknown as
		{ id: string; name: string } | undefined;
	if (clash) {
		throw new Error(
			`cannot create Inbox: prefix ${INBOX_PROJECT_PREFIX} is taken by project "${clash.name}" (${clash.id})`,
		);
	}

	const createdAt = new Date().toISOString();
	db.prepare(
		"INSERT INTO projects (id, name, prefix, created_at) VALUES (?, ?, ?, ?)",
	).run(INBOX_PROJECT_ID, "Inbox", INBOX_PROJECT_PREFIX, createdAt);
	return projectById(db, INBOX_PROJECT_ID)!;
}

export function getProject(db: DatabaseSync, id: string): Project | undefined {
	return projectById(db, id);
}

export function listProjects(
	db: DatabaseSync,
	options: ListProjectsOptions = {},
): Project[] {
	const rows = options.includeArchived
		? db.prepare("SELECT * FROM projects ORDER BY name").all()
		: db
				.prepare(
					"SELECT * FROM projects WHERE archived_at IS NULL ORDER BY name",
				)
				.all();
	return (rows as unknown as ProjectRow[]).map(mapProject);
}

export function updateProject(
	db: DatabaseSync,
	id: string,
	patch: ProjectPatch,
): Result<Project, AppError> {
	const current = getProject(db, id);
	if (!current) {
		return err(notFound(`project ${id} not found`));
	}

	if (patch.archived === true && id === INBOX_PROJECT_ID) {
		return err(invalid("inbox cannot be archived"));
	}

	const sets: string[] = [];
	const params: (string | null)[] = [];

	if (patch.name !== undefined) {
		const name = patch.name.trim();
		if (!name) {
			return err(invalid("project name is required"));
		}
		sets.push("name = ?");
		params.push(name);
	}
	if (patch.archived !== undefined) {
		sets.push("archived_at = ?");
		params.push(patch.archived ? new Date().toISOString() : null);
	}

	if (sets.length === 0) {
		return ok(current);
	}

	return guard(() => {
		db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(
			...params,
			id,
		);
		return projectById(db, id)!;
	});
}
