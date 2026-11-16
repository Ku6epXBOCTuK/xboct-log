import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const sourceFlag = args.includes("--source")
	? args[args.indexOf("--source") + 1]
	: undefined;
const source = sourceFlag ?? process.env.XBOCT_LOG_PROD_DB;
if (!source) {
	console.error("--source <db> or XBOCT_LOG_PROD_DB is required");
	process.exit(1);
}
const root = join(import.meta.dirname, "..");
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
