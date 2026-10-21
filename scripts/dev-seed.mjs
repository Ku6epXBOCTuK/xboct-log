import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const root = join(import.meta.dirname, "..", ".dev");
const seedDir = join(root, "seed");
const target = process.env.XBOCT_LOG_DEV_DB ?? join(root, "dev.db");

function fail(message) {
	console.error(message);
	process.exit(1);
}

if (!existsSync(seedDir)) {
	fail(`seed directory not found: ${seedDir}`);
}

const candidates = readdirSync(seedDir)
	.filter((name) => name.endsWith(".db"))
	.map((name) => {
		const path = join(seedDir, name);
		return { path, mtime: statSync(path).mtimeMs };
	})
	.sort((a, b) => b.mtime - a.mtime);

if (candidates.length === 0) {
	fail(`no .db snapshots in ${seedDir}`);
}

const source = candidates[0];
const stat = statSync(source.path);

mkdirSync(join(root), { recursive: true });
const db = new DatabaseSync(source.path, { readOnly: true });
try {
	await backup(db, target);
} finally {
	db.close();
}

console.log(`seeded ${source.path} -> ${target}`);
console.log(`snapshot mtime: ${new Date(source.mtime).toISOString()}`);
console.log(`snapshot size:  ${stat.size} bytes`);
console.log(
	"restart the dev server: a running server keeps its own file handle and keeps showing the old data",
);
