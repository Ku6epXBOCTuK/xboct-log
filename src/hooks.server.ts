import { pruneActivity } from "#lib/server/activity.ts";
import { getDb } from "#lib/server/db.ts";
import { migrateDatabase } from "#lib/server/migrations.ts";
import { defaultDbPath } from "#lib/server/paths.ts";
import { purgeSoftDeletedTasks } from "#lib/server/purge.ts";
import { ensureInbox } from "#lib/server/projects.ts";
import { startScheduler } from "#lib/server/scheduler.ts";
import type { ServerInit } from "@sveltejs/kit/hooks";

export const init: ServerInit = async () => {
	const db = getDb();
	console.log(`database: ${defaultDbPath()}`);
	await migrateDatabase(db);
	pruneActivity(db);
	purgeSoftDeletedTasks(db);
	ensureInbox(db);
	startScheduler();
};
