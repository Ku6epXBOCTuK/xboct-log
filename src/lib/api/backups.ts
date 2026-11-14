import type {
	BackupItem,
	BackupKind,
	RestoreOutcome,
	SnapshotInfo,
} from "#lib/types.ts";
import { client, unwrap } from "./client.ts";

export async function createBackup(
	input: Record<string, never> = {},
): Promise<{ path: string }> {
	return unwrap<{ path: string }>(
		await client.POST("/api/backup_create", { body: input }),
	);
}

export async function listBackupFiles(
	input: Record<string, never> = {},
): Promise<{ items: BackupItem[] }> {
	return unwrap<{ items: BackupItem[] }>(
		await client.POST("/api/backup_list", { body: input }),
	);
}

export async function inspectBackup(input: {
	kind: BackupKind;
	name: string;
}): Promise<SnapshotInfo> {
	return unwrap<SnapshotInfo>(
		await client.POST("/api/backups_inspect", { body: input }),
	);
}

export async function applyBackup(input: {
	kind: BackupKind;
	name: string;
}): Promise<RestoreOutcome> {
	return unwrap<RestoreOutcome>(
		await client.POST("/api/backups_restore", { body: input }),
	);
}
