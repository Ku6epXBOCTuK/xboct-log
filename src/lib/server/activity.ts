import type { DatabaseSync } from "node:sqlite";
import { XBOCT_LOG_ACTIVITY_KEEP_DAYS } from "$app/env/private";

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
