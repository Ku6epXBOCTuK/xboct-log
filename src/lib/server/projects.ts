import { err, ok, type Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import {
	normalizeProjectPrefix,
	normalizeRepo,
	projectIdError,
	projectPrefixError,
	repoError,
} from "../projects/create";
import { INBOX_PROJECT_ID, INBOX_PROJECT_PREFIX, type Project } from "../types";
import { AppError, conflict, guard, invalid, notFound } from "./errors";

interface ProjectRow {
	id: string;
	name: string;
	prefix: string;
	repo: string | null;
	created_at: string;
	archived_at: string | null;
}

export interface NewProject {
	id: string;
	name: string;
	prefix: string;
	repo?: string | null;
}

export interface ProjectPatch {
	name?: string;
	repo?: string | null;
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
		repo: row.repo,
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
	const prefix = normalizeProjectPrefix(input.prefix ?? "");

	const idError = projectIdError(id);
	if (idError !== null) {
		return err(invalid(idError));
	}
	if (!name) {
		return err(invalid("project name is required"));
	}
	const prefixError = projectPrefixError(prefix);
	if (prefixError !== null) {
		return err(invalid(prefixError));
	}
	const repositoryError = repoError(input.repo ?? "");
	if (repositoryError !== null) {
		return err(invalid(repositoryError));
	}
	const repo = normalizeRepo(input.repo ?? "");

	const clash = db
		.prepare(
			"SELECT 1 FROM projects WHERE id = ? OR prefix = ? COLLATE NOCASE LIMIT 1",
		)
		.get(id, prefix);
	if (clash) {
		return err(conflict("project id or prefix already exists"));
	}

	const createdAt = new Date().toISOString();
	return guard(() => {
		db.prepare(
			"INSERT INTO projects (id, name, prefix, repo, created_at) VALUES (?, ?, ?, ?, ?)",
		).run(id, name, prefix, repo, createdAt);
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
		.prepare("SELECT id, name FROM projects WHERE prefix = ? COLLATE NOCASE")
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

export function resolveProjectRef(
	db: DatabaseSync,
	ref: string,
): Project | undefined {
	const trimmed = ref.trim();
	const byId = projectById(db, trimmed);
	if (byId) {
		return byId;
	}
	const byPrefix = db
		.prepare("SELECT * FROM projects WHERE prefix = ? COLLATE NOCASE")
		.get(trimmed) as unknown as ProjectRow | undefined;
	return byPrefix ? mapProject(byPrefix) : undefined;
}

export function listProjects(
	db: DatabaseSync,
	options: ListProjectsOptions = {},
): Project[] {
	const rows = options.includeArchived
		? db
				.prepare(
					"SELECT * FROM projects ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, name",
				)
				.all(INBOX_PROJECT_ID)
		: db
				.prepare(
					"SELECT * FROM projects WHERE archived_at IS NULL ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, name",
				)
				.all(INBOX_PROJECT_ID);
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
	if (patch.repo !== undefined) {
		const raw = patch.repo ?? "";
		const repositoryError = repoError(raw);
		if (repositoryError !== null) {
			return err(invalid(repositoryError));
		}
		sets.push("repo = ?");
		params.push(normalizeRepo(raw));
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
