import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import { conflict, invalid, notFound, type AppError } from "./errors";

export const LINK_TYPES = ["blocks", "relates_to", "duplicates"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export function isLinkType(value: string): value is LinkType {
	return (LINK_TYPES as readonly string[]).includes(value);
}

const SYMMETRIC_TYPES = new Set<string>(["relates_to"]);

function taskExists(db: DatabaseSync, taskId: string): boolean {
	const row = db
		.prepare("SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL")
		.get(taskId);
	return row !== undefined;
}

function linkVerb(type: LinkType): string {
	return type === "blocks" ? "block" : type.replace("_", " ");
}

function orderedPair(
	sourceTaskId: string,
	targetTaskId: string,
	type: LinkType,
): [string, string] {
	if (!SYMMETRIC_TYPES.has(type)) {
		return [sourceTaskId, targetTaskId];
	}
	return sourceTaskId <= targetTaskId
		? [sourceTaskId, targetTaskId]
		: [targetTaskId, sourceTaskId];
}

function hasDirectedPath(
	db: DatabaseSync,
	type: LinkType,
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
				`SELECT target_task_id FROM task_links
				 WHERE link_type = ? AND source_task_id = ?`,
			)
			.all(type, current) as unknown as { target_task_id: string }[];
		for (const row of rows) {
			stack.push(row.target_task_id);
		}
	}
	return false;
}

function hasLink(
	db: DatabaseSync,
	type: LinkType,
	sourceTaskId: string,
	targetTaskId: string,
): boolean {
	const [source, target] = orderedPair(sourceTaskId, targetTaskId, type);
	const row = db
		.prepare(
			`SELECT 1 FROM task_links
			 WHERE link_type = ? AND source_task_id = ? AND target_task_id = ?`,
		)
		.get(type, source, target);
	return row !== undefined;
}

function insertLink(
	db: DatabaseSync,
	type: LinkType,
	sourceTaskId: string,
	targetTaskId: string,
): void {
	const [source, target] = orderedPair(sourceTaskId, targetTaskId, type);
	db.prepare(
		"INSERT OR IGNORE INTO task_links (source_task_id, target_task_id, link_type, created_at) VALUES (?, ?, ?, ?)",
	).run(source, target, type, new Date().toISOString());
}

export function addLink(
	db: DatabaseSync,
	type: LinkType,
	sourceTaskId: string,
	targetTaskId: string,
): Result<string, AppError> {
	if (sourceTaskId === targetTaskId) {
		return err(invalid(`a task cannot ${linkVerb(type)} itself`));
	}
	if (!taskExists(db, sourceTaskId)) {
		return err(notFound(`task ${sourceTaskId} not found`));
	}
	if (!taskExists(db, targetTaskId)) {
		return err(notFound(`task ${targetTaskId} not found`));
	}
	if (!SYMMETRIC_TYPES.has(type)) {
		if (hasDirectedPath(db, type, targetTaskId, sourceTaskId)) {
			return err(
				conflict(
					`${type} cycle: ${targetTaskId} already ${type.replace("_", " ")} ${sourceTaskId}`,
				),
			);
		}
	}
	if (hasLink(db, type, sourceTaskId, targetTaskId)) {
		return ok(
			`${sourceTaskId} already ${type.replace("_", " ")} ${targetTaskId}`,
		);
	}
	insertLink(db, type, sourceTaskId, targetTaskId);
	return ok(`${sourceTaskId} ${type.replace("_", " ")} ${targetTaskId}`);
}

export function removeLink(
	db: DatabaseSync,
	type: LinkType,
	sourceTaskId: string,
	targetTaskId: string,
): Result<string, AppError> {
	const [source, target] = orderedPair(sourceTaskId, targetTaskId, type);
	const result = db
		.prepare(
			"DELETE FROM task_links WHERE link_type = ? AND source_task_id = ? AND target_task_id = ?",
		)
		.run(type, source, target);
	if (result.changes === 0) {
		return err(
			notFound(`no ${type} link between ${sourceTaskId} and ${targetTaskId}`),
		);
	}
	if (type === "blocks") {
		releaseBlockedStatus(db, [target]);
	}
	return ok(
		`${sourceTaskId} no longer ${type.replace("_", " ")} ${targetTaskId}`,
	);
}

export function listBlockedBy(db: DatabaseSync, taskId: string): string[] {
	const rows = db
		.prepare(
			`SELECT l.source_task_id AS id FROM task_links l
			 JOIN tasks ON tasks.id = l.source_task_id
			 WHERE l.link_type = 'blocks' AND l.target_task_id = ? AND tasks.deleted_at IS NULL
			 ORDER BY id`,
		)
		.all(taskId) as unknown as { id: string }[];
	return rows.map((row) => row.id);
}

export function listBlocks(db: DatabaseSync, taskId: string): string[] {
	const rows = db
		.prepare(
			`SELECT l.target_task_id AS id FROM task_links l
			 JOIN tasks ON tasks.id = l.target_task_id
			 WHERE l.link_type = 'blocks' AND l.source_task_id = ? AND tasks.deleted_at IS NULL
			 ORDER BY id`,
		)
		.all(taskId) as unknown as { id: string }[];
	return rows.map((row) => row.id);
}

export function hasOpenBlockedBy(db: DatabaseSync, taskId: string): boolean {
	const row = db
		.prepare(
			`SELECT COUNT(*) AS count FROM task_links l
			 JOIN tasks ON tasks.id = l.source_task_id
			 WHERE l.link_type = 'blocks' AND l.target_task_id = ? AND tasks.deleted_at IS NULL
			   AND tasks.status NOT IN ('done', 'cancelled')`,
		)
		.get(taskId) as { count: number };
	return row.count > 0;
}

const RESTORE_STATUSES = new Set(["open", "in-progress"]);

export function isRestorableStatus(status: string): boolean {
	return RESTORE_STATUSES.has(status);
}

export interface ReleasedStatus {
	task_id: string;
	status: string;
}

export function releaseBlockedStatus(
	db: DatabaseSync,
	taskIds: string[],
): ReleasedStatus[] {
	const released: ReleasedStatus[] = [];
	const now = new Date().toISOString();
	for (const taskId of taskIds) {
		const task = db
			.prepare(
				"SELECT status, blocked_from_status FROM tasks WHERE id = ? AND deleted_at IS NULL",
			)
			.get(taskId) as
			{ status: string; blocked_from_status: string | null } | undefined;
		if (!task || task.status !== "blocked") {
			continue;
		}
		if (hasOpenBlockedBy(db, taskId)) {
			continue;
		}
		const restored =
			task.blocked_from_status !== null &&
			isRestorableStatus(task.blocked_from_status)
				? task.blocked_from_status
				: "open";
		db.prepare(
			"UPDATE tasks SET status = ?, blocked_from_status = NULL, updated_at = ? WHERE id = ?",
		).run(restored, now, taskId);
		released.push({ task_id: taskId, status: restored });
	}
	return released;
}

export interface BlockingInfo {
	blocked_by: string[];
	blocks: string[];
	relates_to: string[];
	duplicates: string[];
	duplicated_by: string[];
}

function emptyLinkInfo(): BlockingInfo {
	return {
		blocked_by: [],
		blocks: [],
		relates_to: [],
		duplicates: [],
		duplicated_by: [],
	};
}

export function blockingInfoFor(
	db: DatabaseSync,
	taskIds: string[],
): Map<string, BlockingInfo> {
	const info = new Map<string, BlockingInfo>();
	for (const id of taskIds) {
		info.set(id, emptyLinkInfo());
	}
	if (taskIds.length === 0) {
		return info;
	}
	const placeholders = taskIds.map(() => "?").join(", ");
	const rows = db
		.prepare(
			`SELECT l.link_type, l.source_task_id, l.target_task_id FROM task_links l
			 JOIN tasks source ON source.id = l.source_task_id AND source.deleted_at IS NULL
			 JOIN tasks target ON target.id = l.target_task_id AND target.deleted_at IS NULL
			 WHERE l.target_task_id IN (${placeholders}) OR l.source_task_id IN (${placeholders})`,
		)
		.all(...taskIds, ...taskIds) as unknown as {
		link_type: LinkType;
		source_task_id: string;
		target_task_id: string;
	}[];
	for (const row of rows) {
		const source = info.get(row.source_task_id);
		const target = info.get(row.target_task_id);
		if (row.link_type === "blocks") {
			target?.blocked_by.push(row.source_task_id);
			source?.blocks.push(row.target_task_id);
		} else if (row.link_type === "relates_to") {
			source?.relates_to.push(row.target_task_id);
			target?.relates_to.push(row.source_task_id);
		} else if (row.link_type === "duplicates") {
			source?.duplicates.push(row.target_task_id);
			target?.duplicated_by.push(row.source_task_id);
		}
	}
	for (const entry of info.values()) {
		entry.blocked_by.sort();
		entry.blocks.sort();
		entry.relates_to.sort();
		entry.duplicates.sort();
		entry.duplicated_by.sort();
	}
	return info;
}

export function deleteLinksForTask(db: DatabaseSync, taskId: string): void {
	db.prepare(
		"DELETE FROM task_links WHERE source_task_id = ? OR target_task_id = ?",
	).run(taskId, taskId);
}

export function addBlocker(
	db: DatabaseSync,
	blockedByTaskId: string,
	blockedTaskId: string,
): Result<string, AppError> {
	return addLink(db, "blocks", blockedByTaskId, blockedTaskId);
}

export function removeBlocker(
	db: DatabaseSync,
	blockedByTaskId: string,
	blockedTaskId: string,
): Result<string, AppError> {
	return removeLink(db, "blocks", blockedByTaskId, blockedTaskId);
}
