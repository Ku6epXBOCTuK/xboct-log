import { homedir } from "node:os";
import { join } from "node:path";
import { defineEnvVars } from "@sveltejs/kit/env";

export function envInt(value: string | undefined, fallback: number): number {
	if (value === undefined || value === "") {
		return fallback;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function envBool(value: string | undefined): boolean {
	return value === "1" || value === "true" || value === "yes";
}

export const variables = defineEnvVars({
	XBOCT_LOG_DB: {
		static: false,
		description: "Absolute path to the SQLite database file",
	},
	XBOCT_LOG_MIGRATIONS: {
		static: false,
		description: "Directory with migration files",
		schema: (value) => value || join(process.cwd(), "migrations"),
	},
	XBOCT_LOG_BACKUP_DIR: {
		static: false,
		description: "Directory for database backups",
		schema: (value) => value || join(homedir(), ".xboct-log", "backups"),
	},
	XBOCT_LOG_BACKUP_HOUR: {
		static: false,
		description: "Backup hour (0-23)",
		schema: (value) => envInt(value, 3),
	},
	XBOCT_LOG_BACKUP_MINUTE: {
		static: false,
		description: "Backup minute (0-59)",
		schema: (value) => envInt(value, 0),
	},
	XBOCT_LOG_BACKUP_WEEKDAY: {
		static: false,
		description: "Weekly backup weekday (0 = Sunday)",
		schema: (value) => envInt(value, 0),
	},
	XBOCT_LOG_BACKUP_DAILY_KEEP: {
		static: false,
		description: "Number of daily backups to keep",
		schema: (value) => envInt(value, 7),
	},
	XBOCT_LOG_BACKUP_WEEKLY_KEEP: {
		static: false,
		description: "Number of weekly backups to keep",
		schema: (value) => envInt(value, 4),
	},
	XBOCT_LOG_BACKUP_DISABLED: {
		static: false,
		description: "Disable scheduled backups when set to 1, true or yes",
		schema: envBool,
	},
	XBOCT_LOG_ACTIVITY_KEEP_DAYS: {
		static: false,
		description: "Days to keep activity log rows",
		schema: (value) => {
			const days = envInt(value, 365);
			return days > 0 ? days : 365;
		},
	},
});
