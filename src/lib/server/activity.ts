import { XBOCT_LOG_ACTIVITY_KEEP_DAYS } from "$app/env/private";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
	ActivityChange,
	ActivityEntity,
	ActivityItem,
	ActivityLogItem,
	ActivitySource,
} from "../types";

const DAY_MS = 86_400_000;

export { ACTIVITY_ENTITIES } from "../types";
export type { ActivityEntity, ActivitySource } from "../types";

export interface ActivityEntry {
	entity: ActivityEntity;
	entity_id: string;
	old_id?: string | null;
	fields: string[];
	changes?: ActivityChange[];
}

export function activityEntry(
	entity: ActivityEntity,
	entityId: string | number,
	fields: string[],
	oldId?: string | null,
	changes?: ActivityChange[],
): ActivityEntry {
	return {
		entity,
		entity_id: String(entityId),
		old_id: oldId ?? null,
		fields,
		changes: changes ?? [],
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
		`INSERT INTO activity (created_at, source, op, entity, entity_id, old_id, fields, changes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
			JSON.stringify(entry.changes ?? []),
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

export interface ActivitySearch {
	source?: string;
	op?: string;
	entity?: string;
	project_id?: string;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
}

export function searchActivity(
	db: DatabaseSync,
	search: ActivitySearch,
): { items: ActivityLogItem[]; total: number; ops: string[] } {
	if (!activityTableExists(db)) {
		return { items: [], total: 0, ops: [] };
	}

	const clauses: string[] = [];
	const params: SQLInputValue[] = [];

	if (search.source) {
		clauses.push("source = ?");
		params.push(search.source);
	}
	if (search.op) {
		clauses.push("op = ?");
		params.push(search.op);
	}
	if (search.entity) {
		clauses.push("entity = ?");
		params.push(search.entity);
	}
	if (search.project_id) {
		clauses.push(`(
			(entity = 'project' AND entity_id = ?)
			OR (entity = 'task' AND entity_id IN (
				SELECT id FROM tasks WHERE project_id = ?
			))
			OR (entity = 'scope' AND entity_id IN (
				SELECT CAST(id AS TEXT) FROM scopes WHERE project_id = ?
			))
		)`);
		params.push(search.project_id, search.project_id, search.project_id);
	}
	if (search.from) {
		clauses.push("created_at >= ?");
		params.push(search.from);
	}
	if (search.to) {
		clauses.push("created_at <= ?");
		params.push(search.to);
	}

	const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

	const count = db
		.prepare(`SELECT COUNT(*) AS count FROM activity ${where}`)
		.get(...params) as unknown as { count: number };

	const limit = Math.min(Math.max(search.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const offset = Math.max(search.offset ?? 0, 0);

	const rows = db
		.prepare(
			`SELECT created_at, source, op, entity, entity_id, old_id, fields, changes
			 FROM activity ${where}
			 ORDER BY id DESC LIMIT ? OFFSET ?`,
		)
		.all(...params, limit, offset) as unknown as {
		created_at: string;
		source: string;
		op: string;
		entity: string;
		entity_id: string;
		old_id: string | null;
		fields: string;
		changes: string | null;
	}[];

	const opRows = db
		.prepare("SELECT DISTINCT op FROM activity ORDER BY op")
		.all() as unknown as { op: string }[];

	return {
		items: rows.map((row) => ({
			ts: row.created_at,
			source: row.source,
			op: row.op,
			entity: row.entity,
			entity_id: row.entity_id,
			old_id: row.old_id,
			fields: parseFields(row.fields),
			changes: parseChanges(row.changes),
		})),
		total: count.count,
		ops: opRows.map((row) => row.op),
	};
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

function parseChanges(raw: string | null): ActivityChange[] {
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter(
			(change): change is ActivityChange =>
				typeof change === "object" &&
				change !== null &&
				typeof (change as ActivityChange).field === "string",
		);
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
			`SELECT created_at, source, op, fields, old_id, changes
			 FROM activity WHERE ${where}
			 ORDER BY id DESC LIMIT ? OFFSET ?`,
		)
		.all(...params, limit, offset) as unknown as {
		created_at: string;
		source: string;
		op: string;
		fields: string;
		old_id: string | null;
		changes: string | null;
	}[];

	return {
		items: rows.map((row) => ({
			ts: row.created_at,
			source: row.source,
			op: row.op,
			fields: parseFields(row.fields),
			changes: parseChanges(row.changes),
			old_id: row.old_id,
		})),
		total: count.count,
	};
}
