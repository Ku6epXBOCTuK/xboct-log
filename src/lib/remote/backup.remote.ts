import { z } from "zod";
import { backupConfig, runBackup } from "../server/backup";
import { getDb } from "../server/db";
import { defineCommand } from "./define";

export const createBackup = defineCommand({
	name: "backup_create",
	description:
		"Create a manual backup of the database. Writes a copy into the manual backup folder with a date-time stamp and returns its path.",
	kind: "command",
	input: z.object({}),
	handler: async () => {
		const result = await runBackup(getDb(), backupConfig(), "manual");
		return result.map((path) => ({ path }));
	},
});
