import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const root = join(homedir(), ".xboct-log");
const prod = process.env.XBOCT_LOG_PROD_DB ?? join(root, "xboct-log.db");
const dev = process.env.XBOCT_LOG_DB ?? join(root, "dev.db");

if (!existsSync(prod)) {
	console.error(`prod database not found: ${prod}`);
	process.exit(1);
}

const source = new DatabaseSync(prod, { readOnly: true });
try {
	await backup(source, dev);
} finally {
	source.close();
}
console.log(`cloned ${prod} -> ${dev}`);
