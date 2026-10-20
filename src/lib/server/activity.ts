import type { DatabaseSync } from "node:sqlite";

export const ACTIVITY_KEEP_DAYS_ENV = "XBOCT_LOG_ACTIVITY_KEEP_DAYS";

const DEFAULT_KEEP_DAYS = 365;
const DAY_MS = 86_400_000;

export function activityKeepDays(
	env: Record<string, string | undefined> = process.env,
): number {
	const raw = env[ACTIVITY_KEEP_DAYS_ENV];
	if (raw === undefined || raw === "") {
		return DEFAULT_KEEP_DAYS;
	}
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_KEEP_DAYS;
	}
	return parsed;
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
	keepDays: number = activityKeepDays(),
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
