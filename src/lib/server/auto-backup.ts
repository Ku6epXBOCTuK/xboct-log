import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { type BackupConfig, runBackup } from "./backup";

interface AutoBackupState {
	lastAt: number;
	running: boolean;
}

interface AutoBackupGlobal {
	__xboctLogAutoBackup?: AutoBackupState;
}

// NOTE: the flag lives on globalThis because SvelteKit reloads server modules
// in dev without restarting the process, which would reset the interval.
function state(): AutoBackupState {
	const scope = globalThis as AutoBackupGlobal;
	scope.__xboctLogAutoBackup ??= { lastAt: 0, running: false };
	return scope.__xboctLogAutoBackup;
}

export function resetAutoBackupState(): void {
	const scope = globalThis as AutoBackupGlobal;
	scope.__xboctLogAutoBackup = { lastAt: 0, running: false };
}

export function newestAutoSnapshotAt(dir: string): number {
	const autoDir = join(dir, "auto");
	let names: string[];
	try {
		names = readdirSync(autoDir).filter((name) => name.endsWith(".db"));
	} catch {
		return 0;
	}
	let newest = 0;
	for (const name of names) {
		try {
			const mtime = statSync(join(autoDir, name)).mtimeMs;
			if (mtime > newest) {
				newest = mtime;
			}
		} catch {
			continue;
		}
	}
	return newest;
}

export async function maybeAutoBackup(
	db: DatabaseSync,
	config: BackupConfig,
	now: Date = new Date(),
): Promise<string> {
	if (config.disabled) {
		return "";
	}
	const current = state();
	if (current.running) {
		return "";
	}
	const intervalMs = Math.max(config.autoIntervalMin, 1) * 60_000;
	const last = Math.max(current.lastAt, newestAutoSnapshotAt(config.dir));
	if (now.getTime() - last < intervalMs) {
		return "";
	}
	current.running = true;
	try {
		const result = await runBackup(db, config, "auto", now);
		current.lastAt = now.getTime();
		if (result.isErr()) {
			console.warn(`[backup] auto snapshot failed: ${result.error.message}`);
			return "";
		}
		console.log(`[backup] auto snapshot: ${result.value}`);
		return result.value;
	} finally {
		current.running = false;
	}
}
