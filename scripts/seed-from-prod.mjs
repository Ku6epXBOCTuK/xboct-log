import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const root = join(import.meta.dirname, "..");
const source =
	process.env.XBOCT_LOG_PROD_DB ??
	join(homedir(), ".xboct-log", "xboct-log.db");
const seedDir = join(root, ".dev", "seed");
const stamp = new Date()
	.toISOString()
	.slice(0, 19)
	.replaceAll("-", "")
	.replace("T", "-")
	.replaceAll(":", "");
const target = join(seedDir, `xboct-log-${stamp}.db`);

mkdirSync(seedDir, { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
	await backup(db, target);
} finally {
	db.close();
}

console.log(`${source} -> ${target}`);
