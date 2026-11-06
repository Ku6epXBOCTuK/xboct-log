import { pruneActivity } from "#lib/server/activity.ts";
import {
	mediaDir,
	purgeSoftDeletedAttachments,
	relocateMediaFiles,
} from "#lib/server/attachments.ts";
import { getDb } from "#lib/server/db.ts";
import { migrateDatabase } from "#lib/server/migrations.ts";
import { defaultDbPath } from "#lib/server/paths.ts";
import { purgeSoftDeletedTasks } from "#lib/server/purge.ts";
import { ensureInbox } from "#lib/server/projects.ts";
import { startScheduler } from "#lib/server/scheduler.ts";
import type { ServerInit } from "@sveltejs/kit/hooks";

export const init: ServerInit = async () => {
	const db = getDb();
	await migrateDatabase(db);
	try {
		const relocated = relocateMediaFiles(db);
		if (relocated.moved > 0) {
			console.log(
				`media: moved ${relocated.moved} files to the id layout in ${mediaDir()}`,
			);
		}
	} catch (error) {
		console.warn(`media: cannot relocate the files in ${mediaDir()}:`, error);
	}
	pruneActivity(db);
	purgeSoftDeletedTasks(db);
	purgeSoftDeletedAttachments(db);
	ensureInbox(db);
	// NOTE: the checkpoint folds the WAL into the database file, so the data
	// survives even if the WAL is lost or replaced.
	db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
	const tasks = db.prepare("SELECT COUNT(*) AS n FROM tasks").get();
	const count = Number(tasks?.n ?? 0);
	console.log(`database: ${defaultDbPath()} (${count} tasks)`);
	if (count === 0) {
		console.warn(
			"the database holds no tasks — check XBOCT_LOG_DB if this is unexpected",
		);
	}
	startScheduler();
};
