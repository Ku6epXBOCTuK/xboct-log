import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dev = join(root, ".dev");
mkdirSync(dev, { recursive: true });

const port = process.env.XBOCT_LOG_DEV_PORT ?? "45881";
const base = `http://127.0.0.1:${port}`;

const env = {
	...process.env,
	XBOCT_LOG_DEV_PORT: port,
	XBOCT_LOG_PORT: port,
	XBOCT_LOG_HOST: "127.0.0.1",
	XBOCT_LOG_DB: process.env.XBOCT_LOG_DEV_DB ?? join(dev, "dev.db"),
	XBOCT_LOG_MIGRATIONS: join(root, "migrations"),
	XBOCT_LOG_BACKUP_DIR:
		process.env.XBOCT_LOG_DEV_BACKUP_DIR ?? join(dev, "backups"),
	XBOCT_LOG_BACKUP_DISABLED: "1",
};

async function healthy() {
	try {
		const response = await fetch(`${base}/api/health`, {
			signal: AbortSignal.timeout(1000),
		});
		return response.ok;
	} catch {
		return false;
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
if (await healthy()) {
	console.log(`rust server already running at ${base}`);
} else {
	console.log(`starting rust server at ${base}`);
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
			"--no-open",
		],
		{ cwd: root, stdio: "inherit", env },
	);

	const deadline = Date.now() + 10 * 60_000;
	while (!(await healthy())) {
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
