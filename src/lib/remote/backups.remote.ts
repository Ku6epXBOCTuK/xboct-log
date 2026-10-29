import { err } from "neverthrow";
import { z } from "zod";
import {
	backupConfig,
	type BackupConfig,
	type BackupFile,
} from "../server/backup";
import { AppError, invalid, notFound } from "../server/errors";
import { publishReset } from "../server/events";
import { defaultDbPath } from "../server/paths";
import { findBackup, inspectSnapshot, restoreBackup } from "../server/restore";
import { restoreOutcome, snapshotInfo } from "./contracts";
import { defineCommand } from "./define";
import { strictObject } from "./strict";

const target = strictObject({
	kind: z.enum(["auto", "daily", "weekly", "manual"]),
	name: z.string().min(1),
});

type Target = z.infer<typeof target>;

function resolve(
	input: Target,
): { config: BackupConfig; entry: BackupFile } | AppError {
	const config = backupConfig();
	if (config.dir === "") {
		return invalid("the backup directory is not configured");
	}
	const entry = findBackup(config, input.kind, input.name);
	if (entry === undefined) {
		return notFound(`no backup ${input.kind}/${input.name} in ${config.dir}`);
	}
	return { config, entry };
}

export const inspectBackup = defineCommand({
	name: "backups_inspect",
	mcp: false,
	output: snapshotInfo,
	description:
		"Check a backup before restoring it: the header, the integrity check, the migrations it carries and the number of tasks and projects inside. Not exposed to MCP.",
	kind: "command",
	input: target,
	handler: (input) => {
		const found = resolve(input);
		if (found instanceof AppError) {
			return err(found);
		}
		return inspectSnapshot(found.entry.path);
	},
});

export const applyBackup = defineCommand({
	name: "backups_restore",
	mcp: false,
	output: restoreOutcome,
	description:
		"Replace the whole database with the chosen backup. The current state is copied into the manual folder first and every open tab is reloaded afterwards. Not exposed to MCP.",
	kind: "command",
	input: target,
	handler: async (input) => {
		const found = resolve(input);
		if (found instanceof AppError) {
			return err(found);
		}
		const outcome = await restoreBackup({
			dbPath: defaultDbPath(),
			config: found.config,
			target: found.entry,
		});
		if (outcome.isErr()) {
			return outcome;
		}
		// NOTE: the reset event reloads every tab, including the one waiting for
		// this response, so it is delayed until the response has been sent.
		setTimeout(() => publishReset(), 300).unref();
		return outcome;
	},
});
