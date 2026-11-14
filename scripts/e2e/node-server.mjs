import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { databaseArg, seedData } from "./lib/seed.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const APP = process.env.E2E_NODE_APP ?? join(ROOT, ".dev", "node-v0.9.0");
const E2E = join(ROOT, ".dev", "e2e");
const PORT = Number(process.env.E2E_NODE_PORT ?? 5173);
const DB = join(E2E, "xboct-log.db");

if (!existsSync(join(APP, "package.json"))) {
	console.log("[e2e] creating the v0.9.0 worktree");
	const added = spawnSync("git", ["worktree", "add", APP, "v0.9.0"], {
		cwd: ROOT,
		stdio: "inherit",
		shell: true,
	});
	if (added.status !== 0) {
		throw new Error("git worktree add v0.9.0 failed");
	}
}

if (!existsSync(join(APP, "build", "index.js"))) {
	console.log("[e2e] building the v0.9.0 node server");
	const install = spawnSync("pnpm", ["install", "--no-frozen-lockfile"], {
		cwd: APP,
		stdio: "inherit",
		shell: true,
	});
	if (install.status !== 0) {
		throw new Error("pnpm install failed in the worktree");
	}
	const build = spawnSync("pnpm", ["build"], {
		cwd: APP,
		stdio: "inherit",
		shell: true,
	});
	if (build.status !== 0) {
		throw new Error("pnpm build failed in the worktree");
	}
}

mkdirSync(E2E, { recursive: true });
try {
	rmSync(DB, { force: true, maxRetries: 3 });
} catch {
	// NOTE: windows may keep the database locked from a crashed run
}
const source = databaseArg();
if (source) {
	console.log(`[e2e] seeding the node server from ${source}`);
}
await seedData(E2E, source);

const child = spawn(process.execPath, ["build"], {
	cwd: APP,
	env: {
		...process.env,
		PORT: String(PORT),
		HOST: "127.0.0.1",
		ORIGIN: `http://127.0.0.1:${PORT}`,
		PROTOCOL_HEADER: "x-forwarded-proto",
		XBOCT_LOG_DB: DB,
		XBOCT_LOG_MIGRATIONS: join(APP, "migrations"),
		XBOCT_LOG_MEDIA_DIR: join(E2E, "media"),
		XBOCT_LOG_BACKUP_DIR: join(E2E, "node-backups"),
		XBOCT_LOG_BACKUP_DISABLED: "1",
	},
	stdio: ["ignore", "ignore", "pipe"],
});

if (process.env.E2E_VERBOSE) {
	child.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

async function waitForHealth(timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
				signal: AbortSignal.timeout(1000),
			});
			if (response.ok) {
				return;
			}
		} catch {
			// NOTE: the node server is still starting
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("the v0.9.0 node server did not come up");
}

function stop() {
	if (child.exitCode === null) {
		if (process.platform === "win32") {
			spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
				stdio: "ignore",
			});
		} else {
			child.kill("SIGTERM");
		}
	}
}

process.on("SIGINT", () => {
	stop();
	process.exit(0);
});
process.on("SIGTERM", () => {
	stop();
	process.exit(0);
});

await waitForHealth();
console.log(`[e2e] node v0.9.0 on http://127.0.0.1:${PORT}`);
