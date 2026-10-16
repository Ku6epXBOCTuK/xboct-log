import { startBackupScheduler } from "#lib/server/backup.ts";
import { getDb } from "#lib/server/db.ts";
import { ensureInbox } from "#lib/server/projects.ts";
import type { ServerInit } from "@sveltejs/kit/hooks";

export const init: ServerInit = () => {
	ensureInbox(getDb());
	startBackupScheduler();
};
