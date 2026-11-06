import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import { type AppError, conflict, invalid, notFound } from "./errors";

export const LINK_TYPES = ["blocks", "relates_to", "duplicates"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export function isLinkType(value: string): value is LinkType {
	return (LINK_TYPES as readonly string[]).includes(value);
}

const SYMMETRIC_TYPES = new Set<string>(["relates_to"]);

function taskUuid(db: DatabaseSync, key: string): string | undefined {
	const row = db
		.prepare("SELECT id FROM tasks WHERE key = ? AND deleted_at IS NULL")
		.get(key) as { id: string } | undefined;
	return row?.id;
}

function keysForUuids(db: DatabaseSync, uuids: string[]): Map<string, string> {
	const keys = new Map<string, string>();
	if (uuids.length === 0) {
		return keys;
	}
	const rows = db
		.prepare(
			`SELECT id, key FROM tasks WHERE id IN (${uuids.map(() => "?").join(", ")})`,
		)
		.all(...uuids) as unknown as { id: string; key: string }[];
	for (const row of rows) {
		keys.set(row.id, row.key);
	}
	return keys;
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
	sourceKey: string,
	targetKey: string,
): Result<string, AppError> {
	if (sourceKey === targetKey) {
		return err(invalid(`a task cannot ${linkVerb(type)} itself`));
	}
	const sourceTaskId = taskUuid(db, sourceKey);
	if (sourceTaskId === undefined) {
		return err(notFound(`task ${sourceKey} not found`));
	}
	const targetTaskId = taskUuid(db, targetKey);
	if (targetTaskId === undefined) {
		return err(notFound(`task ${targetKey} not found`));
	}
	if (!SYMMETRIC_TYPES.has(type)) {
		if (hasDirectedPath(db, type, targetTaskId, sourceTaskId)) {
			return err(
				conflict(
					`${type} cycle: ${targetKey} already ${type.replace("_", " ")} ${sourceKey}`,
				),
			);
		}
	}
	if (hasLink(db, type, sourceTaskId, targetTaskId)) {
		return ok(`${sourceKey} already ${type.replace("_", " ")} ${targetKey}`);
	}
	insertLink(db, type, sourceTaskId, targetTaskId);
	return ok(`${sourceKey} ${type.replace("_", " ")} ${targetKey}`);
}

export function removeLink(
	db: DatabaseSync,
	type: LinkType,
	sourceKey: string,
	targetKey: string,
): Result<string, AppError> {
	const sourceTaskId = taskUuid(db, sourceKey);
	const targetTaskId = taskUuid(db, targetKey);
	if (sourceTaskId === undefined || targetTaskId === undefined) {
		return err(
			notFound(`no ${type} link between ${sourceKey} and ${targetKey}`),
		);
	}
	const [source, target] = orderedPair(sourceTaskId, targetTaskId, type);
	const result = db
		.prepare(
			"DELETE FROM task_links WHERE link_type = ? AND source_task_id = ? AND target_task_id = ?",
		)
		.run(type, source, target);
	if (result.changes === 0) {
		return err(
			notFound(`no ${type} link between ${sourceKey} and ${targetKey}`),
		);
	}
	if (type === "blocks") {
		releaseBlockedStatus(db, [targetKey]);
	}
	return ok(`${sourceKey} no longer ${type.replace("_", " ")} ${targetKey}`);
}

export function listBlockedBy(db: DatabaseSync, taskKey: string): string[] {
	const rows = db
		.prepare(
			`SELECT l.source_task_id AS id FROM task_links l
			 JOIN tasks ON tasks.id = l.source_task_id
			 WHERE l.link_type = 'blocks'
			   AND l.target_task_id = (SELECT id FROM tasks target WHERE target.key = ?)
			   AND tasks.deleted_at IS NULL
			 ORDER BY l.source_task_id`,
		)
		.all(taskKey) as unknown as { id: string }[];
	return [
		...keysForUuids(
			db,
			rows.map((row) => row.id),
		).values(),
	].sort();
}

export function listBlocks(db: DatabaseSync, taskKey: string): string[] {
	const rows = db
		.prepare(
			`SELECT l.target_task_id AS id FROM task_links l
			 JOIN tasks ON tasks.id = l.target_task_id
			 WHERE l.link_type = 'blocks'
			   AND l.source_task_id = (SELECT id FROM tasks source WHERE source.key = ?)
			   AND tasks.deleted_at IS NULL
			 ORDER BY l.target_task_id`,
		)
		.all(taskKey) as unknown as { id: string }[];
	return [
		...keysForUuids(
			db,
			rows.map((row) => row.id),
		).values(),
	].sort();
}

export function hasOpenBlockedBy(db: DatabaseSync, taskKey: string): boolean {
	const row = db
		.prepare(
			`SELECT COUNT(*) AS count FROM task_links l
			 JOIN tasks ON tasks.id = l.source_task_id
			 WHERE l.link_type = 'blocks'
			   AND l.target_task_id = (SELECT id FROM tasks target WHERE target.key = ?)
			   AND tasks.deleted_at IS NULL
			   AND tasks.status NOT IN ('done', 'cancelled')`,
		)
		.get(taskKey) as { count: number };
	return row.count > 0;
}

const RESTORE_STATUSES = new Set(["backlog", "open", "in-progress"]);

export function isRestorableStatus(status: string): boolean {
	return RESTORE_STATUSES.has(status);
}

export interface ReleasedStatus {
	task_id: string;
	status: string;
}

export function releaseBlockedStatus(
	db: DatabaseSync,
	taskKeys: string[],
): ReleasedStatus[] {
	const released: ReleasedStatus[] = [];
	const now = new Date().toISOString();
	for (const taskKey of taskKeys) {
		const task = db
			.prepare(
				"SELECT status, blocked_from_status FROM tasks WHERE key = ? AND deleted_at IS NULL",
			)
			.get(taskKey) as
			| { status: string; blocked_from_status: string | null }
			| undefined;
		if (!task || task.status !== "blocked") {
			continue;
		}
		if (hasOpenBlockedBy(db, taskKey)) {
			continue;
		}
		const restored =
			task.blocked_from_status !== null &&
			isRestorableStatus(task.blocked_from_status)
				? task.blocked_from_status
				: "open";
		db.prepare(
			"UPDATE tasks SET status = ?, blocked_from_status = NULL, blocked_reason = NULL, updated_at = ? WHERE key = ?",
		).run(restored, now, taskKey);
		released.push({ task_id: taskKey, status: restored });
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
	taskKeys: string[],
): Map<string, BlockingInfo> {
	const info = new Map<string, BlockingInfo>();
	for (const key of taskKeys) {
		info.set(key, emptyLinkInfo());
	}
	if (taskKeys.length === 0) {
		return info;
	}
	const rows = db
		.prepare(
			`SELECT l.link_type, l.source_task_id, l.target_task_id FROM task_links l
			 JOIN tasks source ON source.id = l.source_task_id AND source.deleted_at IS NULL
			 JOIN tasks target ON target.id = l.target_task_id AND target.deleted_at IS NULL
			 WHERE l.target_task_id IN (SELECT id FROM tasks WHERE key IN (${taskKeys.map(() => "?").join(", ")}))
			    OR l.source_task_id IN (SELECT id FROM tasks WHERE key IN (${taskKeys.map(() => "?").join(", ")}))`,
		)
		.all(...taskKeys, ...taskKeys) as unknown as {
		link_type: LinkType;
		source_task_id: string;
		target_task_id: string;
	}[];
	const keys = keysForUuids(
		db,
		rows.flatMap((row) => [row.source_task_id, row.target_task_id]),
	);
	for (const row of rows) {
		const sourceId = keys.get(row.source_task_id);
		const targetId = keys.get(row.target_task_id);
		if (sourceId === undefined || targetId === undefined) {
			continue;
		}
		const source = info.get(sourceId);
		const target = info.get(targetId);
		if (row.link_type === "blocks") {
			target?.blocked_by.push(sourceId);
			source?.blocks.push(targetId);
		} else if (row.link_type === "relates_to") {
			source?.relates_to.push(targetId);
			target?.relates_to.push(sourceId);
		} else if (row.link_type === "duplicates") {
			source?.duplicates.push(targetId);
			target?.duplicated_by.push(sourceId);
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

export function deleteLinksForTask(db: DatabaseSync, taskKey: string): void {
	db.prepare(
		`DELETE FROM task_links
		 WHERE source_task_id = (SELECT id FROM tasks WHERE key = ?)
		    OR target_task_id = (SELECT id FROM tasks WHERE key = ?)`,
	).run(taskKey, taskKey);
}

export function addBlocker(
	db: DatabaseSync,
	blockedByKey: string,
	blockedKey: string,
): Result<string, AppError> {
	return addLink(db, "blocks", blockedByKey, blockedKey);
}

export function removeBlocker(
	db: DatabaseSync,
	blockedByKey: string,
	blockedKey: string,
): Result<string, AppError> {
	return removeLink(db, "blocks", blockedByKey, blockedKey);
}
