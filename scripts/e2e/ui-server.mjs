import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer, request } from "node:http";
import { join } from "node:path";
import {
	ensureBinary,
	startServer,
	stopServer,
	waitForHealth,
} from "./lib/mcp.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const E2E = join(ROOT, ".dev", "e2e");
const RUST_PORT = Number(process.env.E2E_RUST_PORT ?? 45981);
const NODE_PORT = Number(process.env.E2E_NODE_PORT ?? 45982);
const PROXY_PORT = 5173;

const API_PREFIXES = ["/api", "/media", "/deleted/media", "/mcp"];

mkdirSync(E2E, { recursive: true });

function build() {
	if (existsSync(join(ROOT, "build", "index.js"))) {
		return;
	}
	console.log("[e2e] building the node shell");
	const result = spawnSync("pnpm", ["build"], {
		cwd: ROOT,
		stdio: "inherit",
		shell: true,
	});
	if (result.status !== 0) {
		throw new Error("pnpm build failed");
	}
}

function startNode() {
	const child = spawn(process.execPath, ["build"], {
		cwd: ROOT,
		env: {
			...process.env,
			PORT: String(NODE_PORT),
			HOST: "127.0.0.1",
			XBOCT_LOG_DB: join(E2E, "node.db"),
			XBOCT_LOG_MIGRATIONS: join(ROOT, "migrations"),
			XBOCT_LOG_BACKUP_DIR: join(E2E, "node-backups"),
			XBOCT_LOG_BACKUP_DISABLED: "1",
		},
		stdio: ["ignore", "ignore", "pipe"],
	});
	if (process.env.E2E_VERBOSE) {
		child.stderr.on("data", (chunk) => process.stderr.write(chunk));
	}
	return child;
}

async function waitForNode(timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${NODE_PORT}/`, {
				signal: AbortSignal.timeout(1000),
			});
			if (response.ok) {
				return;
			}
		} catch {
			// NOTE: the node shell is still starting
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("the node shell did not come up");
}

function proxy() {
	return createServer((incoming, outgoing) => {
		const url = incoming.url ?? "/";
		const rust = API_PREFIXES.some(
			(prefix) =>
				url === prefix ||
				url.startsWith(`${prefix}/`) ||
				url.startsWith(`${prefix}?`),
		);
		const upstream = request(
			{
				host: "127.0.0.1",
				port: rust ? RUST_PORT : NODE_PORT,
				path: url,
				method: incoming.method,
				headers: incoming.headers,
			},
			(answer) => {
				outgoing.writeHead(answer.statusCode ?? 500, answer.headers);
				answer.pipe(outgoing);
			},
		);
		upstream.on("error", (error) => {
			outgoing.writeHead(502, { "content-type": "text/plain" });
			outgoing.end(String(error));
		});
		incoming.pipe(upstream);
	});
}

ensureBinary();
build();

const rust = startServer({ port: RUST_PORT, dataDir: join(E2E, "rust-data") });
const node = startNode();

let closing = false;
function close() {
	if (closing) {
		return;
	}
	closing = true;
	stopServer(rust, { keep: true });
	if (node.exitCode === null) {
		if (process.platform === "win32") {
			spawnSync("taskkill", ["/pid", String(node.pid), "/t", "/f"], {
				stdio: "ignore",
			});
		} else {
			node.kill("SIGTERM");
		}
	}
}

process.on("SIGINT", () => {
	close();
	process.exit(0);
});
process.on("SIGTERM", () => {
	close();
	process.exit(0);
});

try {
	await waitForHealth(rust.base);
	await waitForNode();
} catch (error) {
	close();
	throw error;
}

const server = proxy();
server.listen(PROXY_PORT, "127.0.0.1", () => {
	console.log(
		`[e2e] ui on http://127.0.0.1:${PROXY_PORT}, rust on ${RUST_PORT}, node on ${NODE_PORT}`,
	);
});

server.on("close", close);
