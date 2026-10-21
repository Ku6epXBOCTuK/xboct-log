import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import net from "node:net";
import { join, resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const args = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	if (arg.startsWith("--")) {
		const [name, inline] = arg.slice(2).split("=");
		if (inline !== undefined) {
			flags.set(name, inline);
			continue;
		}
		const next = args[index + 1];
		if (next !== undefined && !next.startsWith("--")) {
			flags.set(name, next);
			index += 1;
		} else {
			flags.set(name, "true");
		}
		continue;
	}
	positional.push(arg);
}

const [command = "list", ...rest] = positional;

const port = Number(flags.get("port") ?? process.env.PORT ?? 45881);

// NOTE: an empty result stays empty instead of turning into the working
// directory, so a missing variable cannot point the script at an arbitrary
// place.
function pathFrom(value) {
	return value === undefined || value === "" ? "" : resolve(value);
}

const dbPath = pathFrom(flags.get("db") ?? process.env.XBOCT_LOG_DB);
const backupDir = pathFrom(
	flags.get("backups") ?? process.env.XBOCT_LOG_BACKUP_DIR,
);

function fail(message) {
	console.error(message);
	process.exit(1);
}

function listBackups() {
	if (backupDir === "") {
		return [];
	}
	const rows = [];
	for (const kind of ["auto", "daily", "weekly", "manual"]) {
		const dir = join(backupDir, kind);
		let names;
		try {
			names = readdirSync(dir).filter((name) => name.endsWith(".db"));
		} catch {
			continue;
		}
		for (const name of names) {
			const full = join(dir, name);
			try {
				const stat = statSync(full);
				rows.push({
					kind,
					name,
					path: full,
					size: stat.size,
					mtime: stat.mtime.toISOString(),
				});
			} catch {
				continue;
			}
		}
	}
	rows.sort((a, b) => b.mtime.localeCompare(a.mtime));
	return rows;
}

function serverIsListening() {
	return new Promise((resolvePromise) => {
		const socket = net.connect({ port, host: "127.0.0.1" });
		const done = (value) => {
			socket.destroy();
			resolvePromise(value);
		};
		socket.setTimeout(1000);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

function looksLikeDatabase(path) {
	try {
		const header = readFileSync(path, { length: 16 }).toString("utf8");
		return header.startsWith("SQLite format 3");
	} catch {
		return false;
	}
}

async function restore(target) {
	if (dbPath === "") {
		fail(
			"XBOCT_LOG_DB is not set. Pass --db <path> or --env <file> with the database path.",
		);
	}
	if (backupDir === "") {
		fail(
			"XBOCT_LOG_BACKUP_DIR is not set. Pass --backups <dir> or --env <file> with the backup directory.",
		);
	}
	if (!existsSync(target)) {
		fail(`backup not found: ${target}`);
	}
	if (!looksLikeDatabase(target)) {
		fail(`not a SQLite database: ${target}`);
	}
	if (await serverIsListening()) {
		fail(
			`the server is still listening on port ${port}. Stop it first: nssm stop xboct-log`,
		);
	}
	if (existsSync(dbPath)) {
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const safety = join(
			backupDir,
			"manual",
			`xboct-log-before-restore-${stamp}.db`,
		);
		mkdirSync(join(backupDir, "manual"), { recursive: true });
		// NOTE: a plain file copy would miss the pages still living in the WAL,
		// so the safety copy goes through the sqlite backup API.
		const source = new DatabaseSync(dbPath, { readOnly: true });
		try {
			await backup(source, safety);
		} finally {
			source.close();
		}
		console.log(`current database saved to ${safety}`);
	}
	copyFileSync(target, dbPath);
	for (const suffix of ["-wal", "-shm"]) {
		rmSync(`${dbPath}${suffix}`, { force: true });
	}
	console.log(`restored ${target} -> ${dbPath}`);
	console.log("start the service again: nssm start xboct-log");
}

if (command === "list") {
	if (backupDir === "") {
		fail(
			"XBOCT_LOG_BACKUP_DIR is not set. Pass --backups <dir> or --env <file> with the backup directory.",
		);
	}
	const rows = listBackups();
	if (rows.length === 0) {
		console.log(`no backups in ${backupDir}`);
	} else {
		for (const row of rows) {
			console.log(
				`${row.mtime}  ${row.kind.padEnd(6)}  ${String(row.size).padStart(8)}  ${row.path}`,
			);
		}
	}
} else if (command === "restore") {
	const name = rest[0];
	if (name === undefined) {
		fail("usage: node scripts/restore.mjs restore <backup file>");
	}
	const known = listBackups().find((row) => row.path === resolve(name));
	await restore(known ? known.path : resolve(name));
} else {
	fail(`unknown command: ${command}`);
}
