import { XBOCT_LOG_ACTIVITY_KEEP_DAYS } from "$app/env/private";
import type { DatabaseSync } from "node:sqlite";
import type { ActivityItem } from "../types";

const DAY_MS = 86_400_000;

export const ACTIVITY_ENTITIES = ["task", "project", "scope"] as const;

export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export type ActivitySource = "ui" | "mcp" | "cli";

export interface ActivityEntry {
	entity: ActivityEntity;
	entity_id: string;
	old_id?: string | null;
	fields: string[];
}

export function activityEntry(
	entity: ActivityEntity,
	entityId: string | number,
	fields: string[],
	oldId?: string | null,
): ActivityEntry {
	return {
		entity,
		entity_id: String(entityId),
		old_id: oldId ?? null,
		fields,
	};
}

export function fieldNames(value: object | undefined): string[] {
	if (value === undefined) {
		return [];
	}
	return Object.entries(value)
		.filter(([, fieldValue]) => fieldValue !== undefined)
		.map(([name]) => name);
}

export function recordActivity(
	db: DatabaseSync,
	source: ActivitySource,
	op: string,
	entries: ActivityEntry[],
	now: Date = new Date(),
): number {
	if (entries.length === 0 || !activityTableExists(db)) {
		return 0;
	}
	const insert = db.prepare(
		`INSERT INTO activity (created_at, source, op, entity, entity_id, old_id, fields)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	);
	const createdAt = now.toISOString();
	for (const entry of entries) {
		insert.run(
			createdAt,
			source,
			op,
			entry.entity,
			entry.entity_id,
			entry.old_id ?? null,
			JSON.stringify(entry.fields),
		);
	}
	return entries.length;
}

export function activityTableExists(db: DatabaseSync): boolean {
	const row = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activity'",
		)
		.get();
	return row !== undefined;
}

export function pruneActivity(
	db: DatabaseSync,
	keepDays: number = XBOCT_LOG_ACTIVITY_KEEP_DAYS,
	now: Date = new Date(),
): number {
	if (!activityTableExists(db)) {
		return 0;
	}
	const cutoff = new Date(now.getTime() - keepDays * DAY_MS).toISOString();
	const result = db
		.prepare("DELETE FROM activity WHERE created_at < ?")
		.run(cutoff);
	return Number(result.changes);
}

export interface ActivityQuery {
	entity: ActivityEntity;
	entity_id: string;
	limit?: number;
	offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseFields(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? parsed.filter((field): field is string => typeof field === "string")
			: [];
	} catch {
		return [];
	}
}

export function listActivity(
	db: DatabaseSync,
	query: ActivityQuery,
): { items: ActivityItem[]; total: number } {
	if (!activityTableExists(db)) {
		return { items: [], total: 0 };
	}

	// NOTE: a moved task keeps its old rows under the previous id, so the old
	// id is matched as well - the history of a task follows it across projects.
	const where = "entity = ? AND (entity_id = ? OR old_id = ?)";
	const params = [query.entity, query.entity_id, query.entity_id];

	const count = db
		.prepare(`SELECT COUNT(*) AS count FROM activity WHERE ${where}`)
		.get(...params) as unknown as { count: number };

	const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const offset = Math.max(query.offset ?? 0, 0);

	const rows = db
		.prepare(
			`SELECT created_at, source, op, fields, old_id
			 FROM activity WHERE ${where}
			 ORDER BY id DESC LIMIT ? OFFSET ?`,
		)
		.all(...params, limit, offset) as unknown as {
		created_at: string;
		source: string;
		op: string;
		fields: string;
		old_id: string | null;
	}[];

	return {
		items: rows.map((row) => ({
			ts: row.created_at,
			source: row.source,
			op: row.op,
			fields: parseFields(row.fields),
			old_id: row.old_id,
		})),
		total: count.count,
	};
}
