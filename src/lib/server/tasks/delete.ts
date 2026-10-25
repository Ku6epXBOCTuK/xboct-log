import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import type { ActivityChange, Task } from "../../types";
import {
	blockingInfoFor,
	deleteLinksForTask,
	listBlockedBy,
	releaseBlockedStatus,
} from "../links";
import { conflict, guard, notFound, type AppError } from "../errors";
import { withTransaction } from "../db";
import { withBlockingInfo } from "./read";
import { taskById } from "./rows";
import { resolveTaskId, resolveTaskIdInternal } from "./resolve";
import type { DeleteTaskOutcome, ReleasedLink } from "./types";

export function deleteTaskDetailed(
	db: DatabaseSync,
	id: string,
): Result<DeleteTaskOutcome, AppError> {
	const resolved = resolveTaskId(db, id);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const targetId = resolved.value;

	const info = blockingInfoFor(db, [targetId]).get(targetId);
	const blockerIds = info?.blocked_by ?? [];
	const blockedIds = info?.blocks ?? [];
	const blockedBefore = new Map<string, string[]>();
	for (const blockedId of blockedIds) {
		blockedBefore.set(blockedId, listBlockedBy(db, blockedId));
	}
	const children = db
		.prepare("SELECT id FROM tasks WHERE epic_id = ? AND deleted_at IS NULL")
		.all(targetId) as unknown as { id: string }[];

	const now = new Date().toISOString();

	return guard(() =>
		withTransaction(db, () => {
			db.prepare(
				"UPDATE tasks SET epic_id = NULL, updated_at = ? WHERE epic_id = ?",
			).run(now, targetId);
			db.prepare(
				"UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?",
			).run(now, now, targetId);
			deleteLinksForTask(db, targetId);
			const releasedIds = releaseBlockedStatus(db, blockedIds);

			const restored = new Map(
				releasedIds.map((item) => [item.task_id, item.status]),
			);
			const released: ReleasedLink[] = [];
			for (const blockedId of blockedIds) {
				const before = blockedBefore.get(blockedId) ?? [];
				const after = before.filter((blockerId) => blockerId !== targetId);
				const changes: ActivityChange[] = [
					{ field: "blocked_by", from: before, to: after },
				];
				const status = restored.get(blockedId);
				if (status !== undefined) {
					changes.push({ field: "status", from: "blocked", to: status });
				}
				released.push({ task_id: blockedId, changes });
			}
			for (const child of children) {
				released.push({
					task_id: child.id,
					changes: [{ field: "epic_id", from: targetId, to: null }],
				});
			}

			return {
				id: targetId,
				deleted_at: now,
				changes: [
					{ field: "deleted_at", from: null, to: now },
					{ field: "blocked_by", from: blockerIds, to: [] },
				],
				released,
			};
		}),
	);
}

export function deleteTask(
	db: DatabaseSync,
	id: string,
): Result<string, AppError> {
	const result = deleteTaskDetailed(db, id);
	if (result.isErr()) {
		return err(result.error);
	}
	return ok(result.value.id);
}

export function restoreTask(
	db: DatabaseSync,
	id: string,
): Result<Task, AppError> {
	const resolved = resolveTaskIdInternal(db, id, true);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const targetId = resolved.value;
	const task = taskById(db, targetId);
	if (!task) {
		return err(notFound(`task ${targetId} not found`));
	}
	if (task.deleted_at === null) {
		return err(conflict(`task ${targetId} is not deleted`));
	}

	const now = new Date().toISOString();

	return guard(() => {
		withTransaction(db, () => {
			db.prepare(
				"UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?",
			).run(now, targetId);
		});
		return withBlockingInfo(db, [taskById(db, targetId)!])[0];
	});
}
