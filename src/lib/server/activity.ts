import type { DatabaseSync } from "node:sqlite";
import { XBOCT_LOG_ACTIVITY_KEEP_DAYS } from "$app/env/private";

const DAY_MS = 86_400_000;

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
