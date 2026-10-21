import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { backup, type DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import {
	XBOCT_LOG_BACKUP_AUTO_INTERVAL_MIN,
	XBOCT_LOG_BACKUP_AUTO_KEEP,
	XBOCT_LOG_BACKUP_DAILY_KEEP,
	XBOCT_LOG_BACKUP_DIR,
	XBOCT_LOG_BACKUP_DISABLED,
	XBOCT_LOG_BACKUP_HOUR,
	XBOCT_LOG_BACKUP_MINUTE,
	XBOCT_LOG_BACKUP_WEEKDAY,
	XBOCT_LOG_BACKUP_WEEKLY_KEEP,
} from "$app/env/private";
import { type AppError, unexpected } from "./errors";

const APP_NAME = "xboct-log";
const DAY_MS = 24 * 60 * 60 * 1000;

export type BackupKind = "daily" | "weekly" | "manual" | "auto";

export interface BackupConfig {
	dir: string;
	hour: number;
	minute: number;
	weekday: number;
	dailyKeep: number;
	weeklyKeep: number;
	autoKeep: number;
	autoIntervalMin: number;
	disabled: boolean;
}

export function backupConfig(): BackupConfig {
	return {
		dir: XBOCT_LOG_BACKUP_DIR,
		hour: XBOCT_LOG_BACKUP_HOUR,
		minute: XBOCT_LOG_BACKUP_MINUTE,
		weekday: XBOCT_LOG_BACKUP_WEEKDAY,
		dailyKeep: XBOCT_LOG_BACKUP_DAILY_KEEP,
		weeklyKeep: XBOCT_LOG_BACKUP_WEEKLY_KEEP,
		autoKeep: XBOCT_LOG_BACKUP_AUTO_KEEP,
		autoIntervalMin: XBOCT_LOG_BACKUP_AUTO_INTERVAL_MIN,
		disabled: XBOCT_LOG_BACKUP_DISABLED,
	};
}

const pad = (value: number) => String(value).padStart(2, "0");

export function localDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoWeek(date: Date): string {
	const day = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
	);
	const weekday = day.getUTCDay() || 7;
	day.setUTCDate(day.getUTCDate() + 4 - weekday);
	const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
	const week = Math.ceil(((day.getTime() - yearStart) / DAY_MS + 1) / 7);
	return `${day.getUTCFullYear()}-W${pad(week)}`;
}

export function localTime(date: Date): string {
	return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function backupFileName(kind: BackupKind, date: Date): string {
	const stamp =
		kind === "daily"
			? localDate(date)
			: kind === "weekly"
				? isoWeek(date)
				: `${localDate(date)}-${localTime(date)}`;
	return `${APP_NAME}-${stamp}.db`;
}

export function prune(dir: string, keep: number): void {
	if (keep < 1) {
		return;
	}
	let names: string[];
	try {
		names = readdirSync(dir).filter((name) => name.endsWith(".db"));
	} catch {
		return;
	}
	names.sort().reverse();
	for (const name of names.slice(keep)) {
		try {
			rmSync(join(dir, name), { force: true });
		} catch (error) {
			console.warn(`[backup] failed to remove ${name}`, error);
		}
	}
}

export interface BackupFile {
	kind: BackupKind;
	name: string;
	path: string;
	size: number;
	mtime: string;
}

export function listBackups(config: BackupConfig): BackupFile[] {
	const kinds: BackupKind[] = ["auto", "daily", "weekly", "manual"];
	const files: BackupFile[] = [];
	for (const kind of kinds) {
		const dir = join(config.dir, kind);
		let names: string[];
		try {
			names = readdirSync(dir).filter((name) => name.endsWith(".db"));
		} catch {
			continue;
		}
		for (const name of names) {
			const path = join(dir, name);
			try {
				const stat = statSync(path);
				files.push({
					kind,
					name,
					path,
					size: stat.size,
					mtime: stat.mtime.toISOString(),
				});
			} catch {
				continue;
			}
		}
	}
	files.sort((a, b) => b.mtime.localeCompare(a.mtime));
	return files;
}

export async function runBackup(
	db: DatabaseSync,
	config: BackupConfig,
	kind: BackupKind,
	now: Date = new Date(),
): Promise<Result<string, AppError>> {
	// NOTE: XBOCT_LOG_BACKUP_DISABLED stops the scheduler, but an explicit
	// manual request is still honoured.
	if (config.disabled && kind !== "manual") {
		return ok("");
	}
	const dir = join(config.dir, kind);
	const target = join(dir, backupFileName(kind, now));
	try {
		mkdirSync(dir, { recursive: true });
		rmSync(target, { force: true });
		await backup(db, target);
	} catch (error) {
		return err(unexpected(error));
	}
	if (kind === "daily") {
		prune(dir, config.dailyKeep);
	} else if (kind === "weekly") {
		prune(dir, config.weeklyKeep);
	} else if (kind === "auto") {
		prune(dir, config.autoKeep);
	}
	return ok(target);
}

export async function runScheduled(
	db: DatabaseSync,
	config: BackupConfig,
	now: Date = new Date(),
): Promise<Result<string[], AppError>> {
	const daily = await runBackup(db, config, "daily", now);
	if (daily.isErr()) {
		return err(daily.error);
	}
	const saved = [daily.value];
	if (now.getDay() === config.weekday) {
		const weekly = await runBackup(db, config, "weekly", now);
		if (weekly.isErr()) {
			return err(weekly.error);
		}
		saved.push(weekly.value);
	}
	return ok(saved);
}

function scheduledFor(config: BackupConfig, now: Date): Date {
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		config.hour,
		config.minute,
		0,
		0,
	);
}

export async function catchUp(
	db: DatabaseSync,
	config: BackupConfig,
	now: Date = new Date(),
): Promise<Result<string[], AppError>> {
	if (config.disabled || now.getTime() < scheduledFor(config, now).getTime()) {
		return ok([]);
	}

	const saved: string[] = [];
	const daily = join(config.dir, "daily", backupFileName("daily", now));
	if (!existsSync(daily)) {
		const result = await runBackup(db, config, "daily", now);
		if (result.isErr()) {
			return err(result.error);
		}
		saved.push(result.value);
	}

	if (now.getDay() === config.weekday) {
		const weekly = join(config.dir, "weekly", backupFileName("weekly", now));
		if (!existsSync(weekly)) {
			const result = await runBackup(db, config, "weekly", now);
			if (result.isErr()) {
				return err(result.error);
			}
			saved.push(result.value);
		}
	}
	return ok(saved);
}

export function reportBackup(
	label: string,
	result: Result<string[], AppError>,
): void {
	if (result.isErr()) {
		console.warn(`[backup] ${label} failed: ${result.error.message}`);
		return;
	}
	const saved = result.value.filter((file) => file !== "");
	if (saved.length > 0) {
		console.log(`[backup] ${label}: ${saved.join(", ")}`);
	}
}
