import type { DatabaseSync } from "node:sqlite";
import { err, type Result } from "neverthrow";
import { CLOSED_STATUSES, type Task } from "../../types";
import { guard, invalid, notFound, type AppError } from "../errors";
import { getProject } from "../projects";
import { withBlockingInfo } from "./read";
import {
	emptyToNull,
	isEstimate,
	isPriority,
	isStatus,
	normalizeTags,
	taskById,
} from "./rows";
import { resolveEpicId, validateScope } from "./resolve";
import type { NewTask } from "./types";

export function allocateNumber(db: DatabaseSync, projectId: string): number {
	const { high, used } = db
		.prepare(
			`SELECT
				COALESCE((SELECT last_number FROM task_number_high_water WHERE project_id = ?), 0) AS high,
				COALESCE((SELECT MAX(number) FROM tasks WHERE project_id = ?), 0) AS used`,
		)
		.get(projectId, projectId) as { high: number; used: number };
	const next = Math.max(high, used) + 1;
	db.prepare(
		`INSERT INTO task_number_high_water (project_id, last_number)
		 VALUES (?, ?)
		 ON CONFLICT (project_id) DO UPDATE SET last_number = excluded.last_number`,
	).run(projectId, next);
	return next;
}

export function createTask(
	db: DatabaseSync,
	input: NewTask,
): Result<Task, AppError> {
	const project = getProject(db, input.project_id);
	if (!project) {
		return err(notFound(`project ${input.project_id} not found`));
	}

	const title = input.title?.trim() ?? "";
	if (!title) {
		return err(invalid("task title is required"));
	}

	const status = input.status ?? "open";
	if (!isStatus(status)) {
		return err(invalid(`invalid status: ${status}`));
	}
	const priority = input.priority ?? "medium";
	if (!isPriority(priority)) {
		return err(invalid(`invalid priority: ${priority}`));
	}

	const tags = normalizeTags(input.tags);
	const sourceFile = emptyToNull(input.source_file);
	const estimate = input.estimate ?? null;
	if (estimate !== null && !isEstimate(estimate)) {
		return err(invalid(`invalid estimate: ${estimate}`));
	}

	const epicId = input.epic_id ? input.epic_id : null;
	let resolvedEpicId: string | null = null;
	if (epicId) {
		const resolved = resolveEpicId(db, epicId, project.id);
		if (resolved.isErr()) {
			return err(resolved.error);
		}
		resolvedEpicId = resolved.value;
	}

	const scopeId = input.scope_id ?? null;
	if (scopeId !== null) {
		const scopeError = validateScope(db, scopeId, project.id);
		if (scopeError) {
			return err(scopeError);
		}
	}

	const now = new Date().toISOString();
	const closedAt = CLOSED_STATUSES.includes(status) ? now : null;

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			const n = allocateNumber(db, project.id);
			const id = `${project.prefix}-${n}`;

			db.prepare(
				`INSERT INTO tasks (
					id, project_id, number, title, description, status, priority, is_epic,
					epic_id, scope_id, source_file, tags, estimate, created_at, updated_at, closed_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				id,
				project.id,
				n,
				title,
				input.description ?? "",
				status,
				priority,
				input.is_epic ? 1 : 0,
				resolvedEpicId,
				scopeId,
				sourceFile,
				JSON.stringify(tags),
				estimate,
				now,
				now,
				closedAt,
			);
			db.exec("COMMIT");
			return withBlockingInfo(db, [taskById(db, id)!])[0];
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}
