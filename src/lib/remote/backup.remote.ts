import { backupConfig, listBackups, runBackup } from "../server/backup";
import { getDb } from "../server/db";
import { defineCommand, defineQuery } from "./define";
import { strictObject } from "./strict";

export const createBackup = defineCommand({
	name: "backup_create",
	description:
		"Create a manual backup of the database. Writes a copy into the manual backup folder with a date-time stamp and returns its path. This tool only creates backups; it cannot restore them. Returns: {path} - the path of the written copy.",
	kind: "command",
	input: strictObject({}),
	handler: async () => {
		const result = await runBackup(getDb(), backupConfig(), "manual");
		return result.map((path) => ({ path }));
	},
});

export const listBackupFiles = defineQuery({
	name: "backup_list",
	description:
		"List the existing database backups: the auto snapshots taken before MCP writes, the daily and weekly copies and the manual ones. Returns: {items} newest first, each item is { kind, name, path, size, mtime }. Restoring is not available here: if a restore is needed, tell the user which snapshot to restore and let them do it themselves.",
	kind: "query",
	input: strictObject({}),
	handler: () => ({ items: listBackups(backupConfig()) }),
});
