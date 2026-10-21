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

// NOTE: the path variables have no defaults on purpose. A default would point
// at the production location, so a stray run without a .env would touch the
// live database. A missing variable fails the build instead.
export const variables = defineEnvVars({
	XBOCT_LOG_DB: {
		static: true,
		description: "Absolute path to the SQLite database file",
	},
	XBOCT_LOG_MIGRATIONS: {
		static: true,
		description: "Directory with migration files",
	},
	XBOCT_LOG_BACKUP_DIR: {
		static: true,
		description: "Directory for database backups",
	},
	XBOCT_LOG_BACKUP_HOUR: {
		static: true,
		description: "Backup hour (0-23)",
		schema: (value) => envInt(value, 3),
	},
	XBOCT_LOG_BACKUP_MINUTE: {
		static: true,
		description: "Backup minute (0-59)",
		schema: (value) => envInt(value, 0),
	},
	XBOCT_LOG_BACKUP_WEEKDAY: {
		static: true,
		description: "Weekly backup weekday (0 = Sunday)",
		schema: (value) => envInt(value, 0),
	},
	XBOCT_LOG_BACKUP_DAILY_KEEP: {
		static: true,
		description: "Number of daily backups to keep",
		schema: (value) => envInt(value, 7),
	},
	XBOCT_LOG_BACKUP_WEEKLY_KEEP: {
		static: true,
		description: "Number of weekly backups to keep",
		schema: (value) => envInt(value, 4),
	},
	XBOCT_LOG_BACKUP_AUTO_KEEP: {
		static: true,
		description: "Number of automatic MCP snapshots to keep",
		schema: (value) => envInt(value, 48),
	},
	XBOCT_LOG_BACKUP_AUTO_INTERVAL_MIN: {
		static: true,
		description: "Minutes between automatic MCP snapshots",
		schema: (value) => envInt(value, 30),
	},
	XBOCT_LOG_BACKUP_DISABLED: {
		static: true,
		description: "Disable scheduled backups when set to 1, true or yes",
		schema: envBool,
	},
	XBOCT_LOG_ACTIVITY_KEEP_DAYS: {
		static: true,
		description: "Days to keep activity log rows",
		schema: (value) => {
			const days = envInt(value, 365);
			return days > 0 ? days : 365;
		},
	},
});
