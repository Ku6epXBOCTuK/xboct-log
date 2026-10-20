import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const prod = process.env.XBOCT_LOG_DB;
const dev =
	process.env.XBOCT_LOG_DEV_DB ??
	join(import.meta.dirname, "..", ".dev", "dev.db");

if (prod === undefined || prod === "") {
	console.error("XBOCT_LOG_DB is not set.");
	console.error("Put XBOCT_LOG_DB=<path to the database> in a .env file.");
	process.exit(1);
}

if (!existsSync(prod)) {
	console.error(`prod database not found: ${prod}`);
	process.exit(1);
}

mkdirSync(dirname(dev), { recursive: true });
const source = new DatabaseSync(prod, { readOnly: true });
try {
	await backup(source, dev);
} finally {
	source.close();
}
console.log(`cloned ${prod} -> ${dev}`);
