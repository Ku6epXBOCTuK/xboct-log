import { pruneActivity } from "#lib/server/activity.ts";
import { startBackupScheduler } from "#lib/server/backup.ts";
import { getDb } from "#lib/server/db.ts";
import { migrateDatabase } from "#lib/server/migrations.ts";
import { defaultDbPath } from "#lib/server/paths.ts";
import { ensureInbox } from "#lib/server/projects.ts";
import type { ServerInit } from "@sveltejs/kit/hooks";

export const init: ServerInit = async () => {
	const db = getDb();
	console.log(`database: ${defaultDbPath()}`);
	await migrateDatabase(db);
	pruneActivity(db);
	ensureInbox(db);
	startBackupScheduler();
};
