import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const ROOT = join(import.meta.dirname, "..", "..", "..");
export const APP_DB = "xboct-log.db";

export function newestSeed() {
	const dir = join(ROOT, ".dev", "seed");
	if (!existsSync(dir)) return null;
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".db"))
		.map((name) => ({
			name,
			path: join(dir, name),
			mtime: statSync(join(dir, name)).mtimeMs,
		}))
		.sort((left, right) => right.mtime - left.mtime);
	return files[0]?.path ?? null;
}

export function databaseArg(argv = process.argv) {
	const flag = argv.find((arg) => arg.startsWith("--db="));
	const value = flag?.slice("--db=".length) ?? process.env.E2E_SEED_DB;
	if (value) return value;
	return newestSeed();
}

export async function seedData(dataDir, source = databaseArg()) {
	mkdirSync(dataDir, { recursive: true });
	if (!source) return null;
	const db = new DatabaseSync(source, { readOnly: true });
	try {
		await backup(db, join(dataDir, APP_DB));
	} finally {
		db.close();
	}
	const target = new DatabaseSync(join(dataDir, APP_DB));
	try {
		target.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	} finally {
		target.close();
	}
	const media =
		process.env.XBOCT_LOG_PROD_MEDIA ?? join(homedir(), ".xboct-log", "media");
	if (existsSync(media)) {
		cpSync(media, join(dataDir, "media"), { recursive: true });
	}
	return source;
}
