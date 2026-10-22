import type { DatabaseSync } from "node:sqlite";
import { removeTaskAttachments } from "./attachments";
import { deleteBlockedByLinks } from "./blockers";

const DAY_MS = 86_400_000;

export const PURGE_KEEP_DAYS = 90;

export function purgeSoftDeletedTasks(
	db: DatabaseSync,
	keepDays: number = PURGE_KEEP_DAYS,
	now: Date = new Date(),
): number {
	const cutoff = new Date(now.getTime() - keepDays * DAY_MS).toISOString();
	const ids = (
		db
			.prepare(
				`SELECT id FROM tasks
				 WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
			)
			.all(cutoff) as { id: string }[]
	).map((row) => row.id);

	if (ids.length === 0) {
		return 0;
	}

	const remove = db.prepare("DELETE FROM tasks WHERE id = ?");
	let purged = 0;
	db.exec("BEGIN IMMEDIATE");
	try {
		for (const id of ids) {
			deleteBlockedByLinks(db, id);
			removeTaskAttachments(db, id);
			remove.run(id);
			purged += 1;
		}
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
	return purged;
}
