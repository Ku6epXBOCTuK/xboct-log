import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import {
	CLOSED_STATUSES,
	STATUS_BY_REASON,
	type ClosedReason,
	type Task,
} from "../../types";
import { listBlocks, releaseBlockedStatus } from "../blockers";
import { guard, invalid, type AppError } from "../errors";
import { recordRevision } from "../revisions";
import { withBlockingInfo } from "./read";
import {
	emptyToNull,
	isClosedReason,
	isPriority,
	isStatus,
	normalizeTags,
	taskById,
} from "./rows";
import { resolveEpicId, resolveTaskId, validateScope } from "./resolve";
import type {
	ReleasedLink,
	TaskChange,
	TaskPatch,
	TaskUpdateOutcome,
} from "./types";

export function updateTaskDetailed(
	db: DatabaseSync,
	id: string,
	patch: TaskPatch,
): Result<TaskUpdateOutcome, AppError> {
	const resolved = resolveTaskId(db, id);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const targetId = resolved.value;
	const current = taskById(db, targetId)!;
	const changes: TaskChange[] = [];

	const sets: string[] = [];
	const params: (string | number | null)[] = [];
	const now = new Date().toISOString();

	if (patch.title !== undefined) {
		const title = patch.title.trim();
		if (!title) {
			return err(invalid("task title is required"));
		}
		sets.push("title = ?");
		params.push(title);
		if (title !== current.title) {
			changes.push({ field: "title", from: current.title, to: title });
		}
	}
	if (patch.description !== undefined) {
		sets.push("description = ?");
		params.push(patch.description);
	}
	if (patch.status !== undefined) {
		if (!isStatus(patch.status)) {
			return err(invalid(`invalid status: ${patch.status}`));
		}
		sets.push("status = ?");
		params.push(patch.status);
		if (patch.status !== current.status) {
			changes.push({
				field: "status",
				from: current.status,
				to: patch.status,
			});
		}

		if (CLOSED_STATUSES.includes(patch.status) && current.closed_at === null) {
			sets.push("closed_at = ?");
			params.push(now);
		} else if (
			!CLOSED_STATUSES.includes(patch.status) &&
			current.closed_at !== null
		) {
			sets.push("closed_at = ?");
			params.push(null);
			sets.push("closed_reason = ?");
			params.push(null);
		}
	}
	if (patch.priority !== undefined) {
		if (!isPriority(patch.priority)) {
			return err(invalid(`invalid priority: ${patch.priority}`));
		}
		sets.push("priority = ?");
		params.push(patch.priority);
		if (patch.priority !== current.priority) {
			changes.push({
				field: "priority",
				from: current.priority,
				to: patch.priority,
			});
		}
	}
	if (patch.is_epic !== undefined) {
		sets.push("is_epic = ?");
		params.push(patch.is_epic ? 1 : 0);
		if (patch.is_epic !== current.is_epic) {
			changes.push({
				field: "is_epic",
				from: current.is_epic,
				to: patch.is_epic,
			});
		}
	}
	if (patch.tags !== undefined) {
		const tags = normalizeTags(patch.tags);
		sets.push("tags = ?");
		params.push(JSON.stringify(tags));
		if (
			tags.length !== current.tags.length ||
			tags.some((tag, index) => tag !== current.tags[index])
		) {
			changes.push({ field: "tags", from: current.tags, to: tags });
		}
	}

	const sourceFile =
		patch.source_file !== undefined
			? emptyToNull(patch.source_file)
			: current.source_file;
	if (patch.source_file !== undefined) {
		sets.push("source_file = ?");
		params.push(sourceFile);
	}

	if (patch.epic_id !== undefined) {
		const epicId = patch.epic_id ? patch.epic_id : null;
		let resolvedEpicId: string | null = null;
		if (epicId) {
			const resolved = resolveEpicId(db, epicId, current.project_id, targetId);
			if (resolved.isErr()) {
				return err(resolved.error);
			}
			resolvedEpicId = resolved.value;
		}
		sets.push("epic_id = ?");
		params.push(resolvedEpicId);
		if (resolvedEpicId !== current.epic_id) {
			changes.push({
				field: "epic_id",
				from: current.epic_id,
				to: resolvedEpicId,
			});
		}
	}

	if (patch.scope_id !== undefined) {
		const scopeId = patch.scope_id;
		if (scopeId !== null) {
			const scopeError = validateScope(db, scopeId, current.project_id);
			if (scopeError) {
				return err(scopeError);
			}
		}
		sets.push("scope_id = ?");
		params.push(scopeId);
		if (scopeId !== current.scope_id) {
			changes.push({
				field: "scope_id",
				from: current.scope_id,
				to: scopeId,
			});
		}
	}

	sets.push("updated_at = ?");
	params.push(now);

	const descriptionChanged =
		patch.description !== undefined &&
		patch.description !== current.description;

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			if (descriptionChanged) {
				recordRevision(db, {
					task_id: targetId,
					field: "description",
					body: current.description,
				});
			}
			db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(
				...params,
				targetId,
			);
			db.exec("COMMIT");
			return {
				task: withBlockingInfo(db, [taskById(db, targetId)!])[0],
				changes,
			};
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}

export function updateTask(
	db: DatabaseSync,
	id: string,
	patch: TaskPatch,
): Result<Task, AppError> {
	const result = updateTaskDetailed(db, id, patch);
	return result.isOk() ? ok(result.value.task) : err(result.error);
}

export function closeTaskDetailed(
	db: DatabaseSync,
	id: string,
	reason: ClosedReason,
): Result<TaskUpdateOutcome, AppError> {
	if (!isClosedReason(reason)) {
		return err(invalid(`invalid close reason: ${reason}`));
	}
	const resolved = resolveTaskId(db, id);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const targetId = resolved.value;
	const current = taskById(db, targetId)!;
	const status = STATUS_BY_REASON[reason];
	const changes: TaskChange[] = [
		{ field: "status", from: current.status, to: status },
		{ field: "closed_reason", from: current.closed_reason, to: reason },
	];

	const now = new Date().toISOString();

	return guard(() => {
		db.prepare(
			`UPDATE tasks
			 SET status = ?, closed_at = ?, closed_reason = ?, updated_at = ?
			 WHERE id = ?`,
		).run(status, now, reason, now, targetId);
		const releasedIds = releaseBlockedStatus(db, listBlocks(db, targetId));
		const released: ReleasedLink[] = releasedIds.map((taskId) => ({
			task_id: taskId,
			changes: [{ field: "status", from: "blocked", to: "open" }],
		}));
		return {
			task: withBlockingInfo(db, [taskById(db, targetId)!])[0],
			changes,
			released,
		};
	});
}

export function closeTask(
	db: DatabaseSync,
	id: string,
	reason: ClosedReason,
): Result<Task, AppError> {
	const result = closeTaskDetailed(db, id, reason);
	return result.isOk() ? ok(result.value.task) : err(result.error);
}
