import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import { normalizeDueDate } from "../../tasks/display";
import {
	CLOSED_STATUSES,
	STATUS_BY_REASON,
	type ClosedReason,
	type Task,
} from "../../types";
import {
	isRestorableStatus,
	listBlocks,
	releaseBlockedStatus,
} from "../blockers";
import { guard, invalid, type AppError } from "../errors";
import { withTransaction } from "../db";
import { recordRevision } from "../revisions";
import { withBlockingInfo } from "./read";
import {
	emptyToNull,
	isClosedReason,
	isEstimate,
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

const PATCH_FIELDS = [
	"title",
	"description",
	"status",
	"priority",
	"is_epic",
	"epic_id",
	"scope_id",
	"source_file",
	"tags",
	"estimate",
	"assignee",
	"due_at",
] as const;

function validatePatch(patch: TaskPatch): AppError | null {
	const keys = Object.keys(patch) as (keyof TaskPatch)[];
	const unknown = keys.filter(
		(key) => !(PATCH_FIELDS as readonly string[]).includes(key),
	);
	if (unknown.length > 0) {
		return invalid(
			`unknown patch field(s): ${unknown.join(", ")}. Allowed fields: ${PATCH_FIELDS.join(", ")}`,
		);
	}
	const undefinedFields = keys.filter((key) => patch[key] === undefined);
	if (undefinedFields.length > 0) {
		return invalid(
			`patch field(s) ${undefinedFields.join(", ")} are undefined: pass a value or leave the field out`,
		);
	}
	if (keys.length === 0) {
		return invalid(
			"patch is empty: name at least one field to change (a field set to undefined is not a value)",
		);
	}
	return null;
}

export function updateTaskDetailed(
	db: DatabaseSync,
	id: string,
	patch: TaskPatch,
): Result<TaskUpdateOutcome, AppError> {
	const patchError = validatePatch(patch);
	if (patchError) {
		return err(patchError);
	}
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

		if (patch.status === "blocked") {
			if (current.status !== "blocked") {
				sets.push("blocked_from_status = ?");
				params.push(isRestorableStatus(current.status) ? current.status : null);
			}
		} else {
			sets.push("blocked_from_status = NULL");
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
	if (patch.estimate !== undefined) {
		if (patch.estimate !== null && !isEstimate(patch.estimate)) {
			return err(invalid(`invalid estimate: ${patch.estimate}`));
		}
		sets.push("estimate = ?");
		params.push(patch.estimate);
		if (patch.estimate !== current.estimate) {
			changes.push({
				field: "estimate",
				from: current.estimate,
				to: patch.estimate,
			});
		}
	}
	if (patch.assignee !== undefined) {
		const assignee = emptyToNull(patch.assignee);
		sets.push("assignee = ?");
		params.push(assignee);
		if (assignee !== current.assignee) {
			changes.push({
				field: "assignee",
				from: current.assignee,
				to: assignee,
			});
		}
	}
	if (patch.due_at !== undefined) {
		const dueAt = normalizeDueDate(patch.due_at);
		if (dueAt === null && (patch.due_at ?? "").trim() !== "") {
			return err(invalid(`invalid due date: ${patch.due_at}`));
		}
		sets.push("due_at = ?");
		params.push(dueAt);
		if (dueAt !== current.due_at) {
			changes.push({ field: "due_at", from: current.due_at, to: dueAt });
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

	return guard(() =>
		withTransaction(db, () => {
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
			return {
				task: withBlockingInfo(db, [taskById(db, targetId)!])[0],
				changes,
			};
		}),
	);
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

	return guard(() =>
		withTransaction(db, () => {
			db.prepare(
				`UPDATE tasks
				 SET status = ?, closed_at = ?, closed_reason = ?, updated_at = ?
				 WHERE id = ?`,
			).run(status, now, reason, now, targetId);
			const releasedIds = releaseBlockedStatus(db, listBlocks(db, targetId));
			const released: ReleasedLink[] = releasedIds.map((item) => ({
				task_id: item.task_id,
				changes: [{ field: "status", from: "blocked", to: item.status }],
			}));
			return {
				task: withBlockingInfo(db, [taskById(db, targetId)!])[0],
				changes,
				released,
			};
		}),
	);
}

export function closeTask(
	db: DatabaseSync,
	id: string,
	reason: ClosedReason,
): Result<Task, AppError> {
	const result = closeTaskDetailed(db, id, reason);
	return result.isOk() ? ok(result.value.task) : err(result.error);
}
