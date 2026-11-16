import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = process.env.XBOCT_LOG_DEV_PORT ?? "45883";
const dataDir = resolve(process.env.XBOCT_LOG_DEV_DATA ?? join(root, ".dev"));
const base = `http://127.0.0.1:${port}`;

function fail(message) {
	console.error(message);
	process.exit(1);
}

if (dataDir !== root && !dataDir.startsWith(root + sep)) {
	fail(
		`the dev data folder must stay inside the repository (${root}), got ${dataDir}; clear XBOCT_LOG_DEV_DATA to use .dev`,
	);
}
mkdirSync(dataDir, { recursive: true });

const env = {
	...process.env,
	XBOCT_LOG_DEV_PORT: port,
	XBOCT_LOG_HOST: "127.0.0.1",
	XBOCT_LOG_BACKUP_DISABLED: "1",
};

function fingerprint(path) {
	const absolute = resolve(path).replace(/\\/g, "/");
	const normalized =
		process.platform === "win32" ? absolute.toLowerCase() : absolute;
	return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

const dataId = fingerprint(dataDir);

async function inspect() {
	try {
		const response = await fetch(`${base}/api/health`, {
			signal: AbortSignal.timeout(1000),
		});
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

function killTree(child) {
	if (child === undefined || child.exitCode !== null) return;
	if (process.platform === "win32") {
		spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
			stdio: "ignore",
			shell: true,
		});
		return;
	}
	child.kill();
}

let rust;
const running = await inspect();
if (running) {
	if (running.data !== dataId) {
		fail(
			`port ${port} belongs to another instance with the data fingerprint ${running.data ?? "unknown"}; the dev instance expects ${dataDir} (${dataId}); stop it or run with another XBOCT_LOG_DEV_PORT`,
		);
	}
	console.log(`rust server already running at ${base}`);
} else {
	console.log(`starting rust server at ${base} with ${dataDir}`);
	rust = spawn(
		"cargo",
		[
			"run",
			"-p",
			"xboct-log-cli",
			"--",
			"--port",
			port,
			"--host",
			"127.0.0.1",
			"--data",
			dataDir,
			"--no-open",
		],
		{ cwd: root, stdio: "inherit", env },
	);

	const deadline = Date.now() + 10 * 60_000;
	while (!(await inspect())) {
		if (rust.exitCode !== null) {
			console.error("rust server exited before becoming healthy");
			process.exit(rust.exitCode ?? 1);
		}
		if (Date.now() > deadline) {
			console.error("rust server did not become healthy in 10 minutes");
			killTree(rust);
			process.exit(1);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	console.log(`rust server ready at ${base}`);
}

const vite = spawn(
	"pnpm",
	["exec", "vite", "dev", "--port", "5173", "--host", "127.0.0.1"],
	{
		cwd: root,
		stdio: "inherit",
		env,
		shell: true,
	},
);

function shutdown() {
	killTree(vite);
	killTree(rust);
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

vite.on("exit", (code) => {
	killTree(rust);
	process.exit(code ?? 0);
});
