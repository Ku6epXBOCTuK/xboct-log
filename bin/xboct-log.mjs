#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createServer as createProbe } from "node:net";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP_NAME = "xboct-log";
const DEFAULT_PORT = 45881;
const DEFAULT_HOST = "127.0.0.1";
const appRoot = resolve(import.meta.dirname, "..");

function fail(message) {
	console.error(`${APP_NAME}: ${message}`);
	process.exit(1);
}

function parseArgs(argv) {
	const options = {
		port: Number(process.env.XBOCT_LOG_PORT ?? DEFAULT_PORT),
		host: process.env.XBOCT_LOG_HOST ?? DEFAULT_HOST,
		data: undefined,
		open: true,
		portable: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--port") options.port = Number(argv[++index]);
		else if (arg === "--host") options.host = argv[++index];
		else if (arg === "--data") options.data = argv[++index];
		else if (arg === "--no-open") options.open = false;
		else if (arg === "--portable") options.portable = true;
		else if (arg === "--help" || arg === "-h") options.help = true;
		else if (arg === "--version" || arg === "-v") options.version = true;
		else fail(`unknown argument: ${arg}`);
	}
	if (!Number.isInteger(options.port) || options.port <= 0) {
		fail("--port must be a positive integer");
	}
	return options;
}

function defaultDataDir(options) {
	if (options.data) return resolve(options.data);
	if (process.env.XBOCT_LOG_DATA) return resolve(process.env.XBOCT_LOG_DATA);
	if (options.portable) return join(appRoot, "data");
	if (platform() === "win32") {
		const base =
			process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
		return join(base, "Xboct Log");
	}
	if (platform() === "darwin") {
		return join(homedir(), "Library", "Application Support", "Xboct Log");
	}
	const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
	return join(base, APP_NAME);
}

async function isFree(port, host) {
	return new Promise((done) => {
		const probe = createProbe();
		probe.once("error", () => done(false));
		probe.once("listening", () => probe.close(() => done(true)));
		probe.listen(port, host);
	});
}

async function freePort(host) {
	return new Promise((done, reject) => {
		const probe = createProbe();
		probe.once("error", reject);
		probe.listen(0, host, () => {
			const address = probe.address();
			const port = typeof address === "object" && address ? address.port : 0;
			probe.close(() => done(port));
		});
	});
}

async function health(port) {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
			signal: AbortSignal.timeout(1500),
		});
		if (!response.ok) return undefined;
		const body = await response.json();
		return body?.app === APP_NAME ? body : undefined;
	} catch {
		return undefined;
	}
}

function openBrowser(url) {
	const command =
		platform() === "win32"
			? ["cmd", ["/c", "start", "", url]]
			: platform() === "darwin"
				? ["open", [url]]
				: ["xdg-open", [url]];
	try {
		spawn(command[0], command[1], { detached: true, stdio: "ignore" }).unref();
	} catch {
		console.error(`${APP_NAME}: open ${url} in a browser`);
	}
}

function readVersion() {
	try {
		return JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"))
			.version;
	} catch {
		return "unknown";
	}
}

function help() {
	console.log(`usage: ${APP_NAME} [options]

  --data <dir>   folder for the database, media and backups
  --port <port>  port to listen on (default ${DEFAULT_PORT})
  --host <host>  address to bind (default ${DEFAULT_HOST})
  --no-open      do not open the browser
  --portable     keep the data next to the application
  --version      print the version
  --help         show this text`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
	help();
	process.exit(0);
}
if (options.version) {
	console.log(readVersion());
	process.exit(0);
}

const dataDir = defaultDataDir(options);
const instanceFile = join(dataDir, "instance.json");
const logFile = join(dataDir, "logs", APP_NAME + ".log");

function log(line) {
	const stamped = `${new Date().toISOString()} ${line}`;
	try {
		appendFileSync(logFile, stamped + "\n");
	} catch {
		console.error(stamped);
	}
	if (process.stdout.isTTY) console.log(line);
}

const running = await health(options.port);
if (running) {
	const url = `http://${options.host}:${options.port}/`;
	log(`already running at ${url}`);
	if (options.open) openBrowser(url);
	process.exit(0);
}

if (existsSync(instanceFile)) {
	let previous;
	try {
		previous = JSON.parse(readFileSync(instanceFile, "utf8"));
	} catch {
		previous = undefined;
	}
	if (previous?.pid && previous.pid !== process.pid) {
		log(`stale instance ${previous.pid}`);
	}
	rmSync(instanceFile, { force: true });
}

mkdirSync(logFile.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
mkdirSync(join(dataDir, "media"), { recursive: true });
mkdirSync(join(dataDir, "backups"), { recursive: true });

const migrations = join(appRoot, "migrations");
if (!existsSync(migrations)) fail(`missing migrations folder at ${migrations}`);

const port = (await isFree(options.port, options.host))
	? options.port
	: await freePort(options.host);

process.env.XBOCT_LOG_DB = join(dataDir, `${APP_NAME}.db`);
process.env.XBOCT_LOG_MEDIA_DIR = join(dataDir, "media");
process.env.XBOCT_LOG_BACKUP_DIR = join(dataDir, "backups");
process.env.XBOCT_LOG_MIGRATIONS = migrations;
process.env.HOST = options.host;
process.env.PORT = String(port);
process.env.ORIGIN = `http://${options.host === "0.0.0.0" ? "127.0.0.1" : options.host}:${port}`;

let handler;
try {
	({ handler } = await import(
		pathToFileURL(join(appRoot, "build", "handler.js")).href
	));
} catch (error) {
	fail(
		`cannot load the application: ${error instanceof Error ? error.message : error}`,
	);
}

const server = createServer(handler);
const url = process.env.ORIGIN + "/";

server.on("error", (error) => {
	log(`server error: ${error.message}`);
	fail(error.message);
});

server.listen(port, options.host, () => {
	writeFileSync(
		instanceFile,
		JSON.stringify(
			{ pid: process.pid, port, url, version: readVersion() },
			null,
			2,
		),
	);
	log(`listening on ${url} (data: ${dataDir})`);
	if (options.open) openBrowser(url);
});

function shutdown(signal) {
	log(`stopping on ${signal}`);
	server.close(() => {
		rmSync(instanceFile, { force: true });
		process.exit(0);
	});
	setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
