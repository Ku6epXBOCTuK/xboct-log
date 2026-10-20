import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import { conflict, invalid, notFound, type AppError } from "./errors";

function taskExists(db: DatabaseSync, taskId: string): boolean {
	const row = db
		.prepare("SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL")
		.get(taskId);
	return row !== undefined;
}

function hasBlockingPath(
	db: DatabaseSync,
	fromTaskId: string,
	toTaskId: string,
): boolean {
	const stack = [fromTaskId];
	const seen = new Set<string>();
	while (stack.length > 0) {
		const current = stack.pop() as string;
		if (current === toTaskId) {
			return true;
		}
		if (seen.has(current)) {
			continue;
		}
		seen.add(current);
		const rows = db
			.prepare(
				"SELECT blocked_task_id FROM task_blocked_by WHERE blocked_by_task_id = ?",
			)
			.all(current) as unknown as { blocked_task_id: string }[];
		for (const row of rows) {
			stack.push(row.blocked_task_id);
		}
	}
	return false;
}

export function listBlockedBy(db: DatabaseSync, taskId: string): string[] {
	const rows = db
		.prepare(
			`SELECT blocked_by_task_id FROM task_blocked_by
			 JOIN tasks ON tasks.id = task_blocked_by.blocked_by_task_id
			 WHERE task_blocked_by.blocked_task_id = ? AND tasks.deleted_at IS NULL
			 ORDER BY blocked_by_task_id`,
		)
		.all(taskId) as unknown as { blocked_by_task_id: string }[];
	return rows.map((row) => row.blocked_by_task_id);
}

export function listBlocks(db: DatabaseSync, taskId: string): string[] {
	const rows = db
		.prepare(
			`SELECT blocked_task_id FROM task_blocked_by
			 JOIN tasks ON tasks.id = task_blocked_by.blocked_task_id
			 WHERE task_blocked_by.blocked_by_task_id = ? AND tasks.deleted_at IS NULL
			 ORDER BY blocked_task_id`,
		)
		.all(taskId) as unknown as { blocked_task_id: string }[];
	return rows.map((row) => row.blocked_task_id);
}

export function hasOpenBlockedBy(db: DatabaseSync, taskId: string): boolean {
	const row = db
		.prepare(
			`SELECT COUNT(*) AS count FROM task_blocked_by
			 JOIN tasks ON tasks.id = task_blocked_by.blocked_by_task_id
			 WHERE task_blocked_by.blocked_task_id = ? AND tasks.deleted_at IS NULL
			   AND tasks.status NOT IN ('done', 'cancelled')`,
		)
		.get(taskId) as { count: number };
	return row.count > 0;
}

export function releaseBlockedStatus(
	db: DatabaseSync,
	taskIds: string[],
): string[] {
	const released: string[] = [];
	const now = new Date().toISOString();
	for (const taskId of taskIds) {
		const task = db
			.prepare("SELECT status FROM tasks WHERE id = ? AND deleted_at IS NULL")
			.get(taskId) as { status: string } | undefined;
		if (!task || task.status !== "blocked") {
			continue;
		}
		if (hasOpenBlockedBy(db, taskId)) {
			continue;
		}
		db.prepare(
			"UPDATE tasks SET status = 'open', updated_at = ? WHERE id = ?",
		).run(now, taskId);
		released.push(taskId);
	}
	return released;
}

export interface BlockingInfo {
	blocked_by: string[];
	blocks: string[];
}

export function blockingInfoFor(
	db: DatabaseSync,
	taskIds: string[],
): Map<string, BlockingInfo> {
	const info = new Map<string, BlockingInfo>();
	for (const id of taskIds) {
		info.set(id, { blocked_by: [], blocks: [] });
	}
	if (taskIds.length === 0) {
		return info;
	}
	const placeholders = taskIds.map(() => "?").join(", ");
	const rows = db
		.prepare(
			`SELECT b.blocked_task_id, b.blocked_by_task_id FROM task_blocked_by b
			 JOIN tasks blocked ON blocked.id = b.blocked_task_id AND blocked.deleted_at IS NULL
			 JOIN tasks blocker ON blocker.id = b.blocked_by_task_id AND blocker.deleted_at IS NULL
			 WHERE b.blocked_task_id IN (${placeholders}) OR b.blocked_by_task_id IN (${placeholders})`,
		)
		.all(...taskIds, ...taskIds) as unknown as {
		blocked_task_id: string;
		blocked_by_task_id: string;
	}[];
	for (const row of rows) {
		const blocked = info.get(row.blocked_task_id);
		blocked?.blocked_by.push(row.blocked_by_task_id);
		const blocker = info.get(row.blocked_by_task_id);
		blocker?.blocks.push(row.blocked_task_id);
	}
	return info;
}

export function addBlocker(
	db: DatabaseSync,
	blockedByTaskId: string,
	blockedTaskId: string,
): Result<string, AppError> {
	if (blockedByTaskId === blockedTaskId) {
		return err(invalid("a task cannot block itself"));
	}
	if (!taskExists(db, blockedByTaskId)) {
		return err(notFound(`task ${blockedByTaskId} not found`));
	}
	if (!taskExists(db, blockedTaskId)) {
		return err(notFound(`task ${blockedTaskId} not found`));
	}
	if (hasBlockingPath(db, blockedTaskId, blockedByTaskId)) {
		return err(
			conflict(
				`blocking cycle: ${blockedTaskId} already blocks ${blockedByTaskId}`,
			),
		);
	}
	db.prepare(
		"INSERT OR IGNORE INTO task_blocked_by (blocked_task_id, blocked_by_task_id, created_at) VALUES (?, ?, ?)",
	).run(blockedTaskId, blockedByTaskId, new Date().toISOString());
	return ok(`${blockedByTaskId} blocks ${blockedTaskId}`);
}

export function removeBlocker(
	db: DatabaseSync,
	blockedByTaskId: string,
	blockedTaskId: string,
): Result<string, AppError> {
	const result = db
		.prepare(
			"DELETE FROM task_blocked_by WHERE blocked_task_id = ? AND blocked_by_task_id = ?",
		)
		.run(blockedTaskId, blockedByTaskId);
	if (result.changes === 0) {
		return err(
			notFound(
				`no blocking link between ${blockedByTaskId} and ${blockedTaskId}`,
			),
		);
	}
	releaseBlockedStatus(db, [blockedTaskId]);
	return ok(`${blockedByTaskId} no longer blocks ${blockedTaskId}`);
}

export function deleteBlockedByLinks(db: DatabaseSync, taskId: string): void {
	db.prepare(
		"DELETE FROM task_blocked_by WHERE blocked_task_id = ? OR blocked_by_task_id = ?",
	).run(taskId, taskId);
}
