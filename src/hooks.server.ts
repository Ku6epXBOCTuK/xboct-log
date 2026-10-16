import { startBackupScheduler } from "#lib/server/backup.ts";
import type { ServerInit } from "@sveltejs/kit/hooks";

export const init: ServerInit = () => {
	startBackupScheduler();
};
