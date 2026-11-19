import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");

let binaryPath = null;

function binary() {
	if (binaryPath === null) {
		const metadata = JSON.parse(
			execFileSync(
				"cargo",
				["metadata", "--format-version", "1", "--no-deps"],
				{
					cwd: ROOT,
					encoding: "utf8",
				},
			),
		);
		binaryPath = join(
			metadata.target_directory,
			"debug",
			process.platform === "win32" ? "xboct-log.exe" : "xboct-log",
		);
	}
	return binaryPath;
}

export const PROTOCOL_VERSION = "2025-06-18";

export function ensureBinary() {
	console.log("[e2e] building the rust server");
	execSync("cargo build -p xboct-log-cli --locked", {
		cwd: ROOT,
		stdio: "inherit",
	});
	binaryPath = null;
}

export function startServer({ port, dataDir, env = {}, args = [] }) {
	const data = dataDir ?? mkdtempSync(join(tmpdir(), "xboct-log-e2e-"));
	mkdirSync(data, { recursive: true });
	const child = spawn(
		binary(),
		[
			"--port",
			String(port),
			"--host",
			"127.0.0.1",
			"--data",
			data,
			"--no-open",
			...args,
		],
		{
			cwd: ROOT,
			env: { ...process.env, XBOCT_LOG_BACKUP_DISABLED: "0", ...env },
			stdio: ["ignore", "ignore", "pipe"],
		},
	);
	if (process.env.E2E_VERBOSE) {
		child.stderr.on("data", (chunk) => process.stderr.write(chunk));
	}
	return { child, dataDir: data, base: `http://127.0.0.1:${port}` };
}

export async function waitForHealth(base, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${base}/api/health`, {
				signal: AbortSignal.timeout(1000),
			});
			if (response.ok) {
				return;
			}
		} catch {
			// NOTE: the server is still starting
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`${base} did not become healthy`);
}

export function stopServer(
	server,
	{ keep = process.env.E2E_KEEP === "1" } = {},
) {
	if (server === undefined) {
		return;
	}
	if (server.child.exitCode === null) {
		if (process.platform === "win32") {
			spawnSync("taskkill", ["/pid", String(server.child.pid), "/t", "/f"], {
				stdio: "ignore",
			});
		} else {
			server.child.kill("SIGTERM");
		}
	}
	if (!keep) {
		rmSync(server.dataDir, { recursive: true, force: true });
	}
}

function parsePayload(raw, contentType) {
	if (contentType.includes("text/event-stream")) {
		const payloads = raw
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice("data:".length).trim())
			.filter((line) => line.length > 0)
			.map((line) => JSON.parse(line));
		const answer = payloads.find((payload) => payload.result !== undefined);
		if (answer === undefined) {
			throw new Error(`no result in the stream: ${raw.slice(0, 200)}`);
		}
		return answer;
	}
	return JSON.parse(raw);
}

export class McpClient {
	constructor(base) {
		this.base = base;
		this.sessionId = null;
		this.nextId = 1;
	}

	async request(method, params) {
		const id = this.nextId;
		this.nextId += 1;
		const headers = {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
		};
		if (this.sessionId !== null) {
			headers["mcp-session-id"] = this.sessionId;
		}
		const response = await fetch(`${this.base}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
			signal: AbortSignal.timeout(30_000),
		});
		const session = response.headers.get("mcp-session-id");
		if (session !== null) {
			this.sessionId = session;
		}
		const raw = await response.text();
		if (!response.ok) {
			throw new Error(
				`${method} failed with ${response.status}: ${raw.slice(0, 300)}`,
			);
		}
		const payload = parsePayload(
			raw,
			response.headers.get("content-type") ?? "",
		);
		if (payload.error !== undefined) {
			throw new Error(`${method} failed: ${JSON.stringify(payload.error)}`);
		}
		return payload.result;
	}

	async initialize() {
		const result = await this.request("initialize", {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "xboct-log-e2e", version: "1" },
		});
		await fetch(`${this.base}/mcp`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...(this.sessionId === null
					? {}
					: { "mcp-session-id": this.sessionId }),
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			}),
		});
		return result;
	}

	async listTools() {
		const result = await this.request("tools/list", {});
		return result.tools;
	}

	async callTool(name, args = {}) {
		const result = await this.request("tools/call", { name, arguments: args });
		return result;
	}

	async listResources() {
		const result = await this.request("resources/list", {});
		return result.resources;
	}

	async listResourceTemplates() {
		const result = await this.request("resources/templates/list", {});
		return result.resourceTemplates;
	}

	async readResource(uri) {
		const result = await this.request("resources/read", { uri });
		return result.contents;
	}
}

export function textOf(result) {
	return result.content?.find((block) => block.type === "text")?.text;
}

export function valueOf(result) {
	if (result.structuredContent !== undefined) {
		return result.structuredContent;
	}
	const text = textOf(result);
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export function errorOf(result) {
	const value = valueOf(result);
	if (value && typeof value === "object" && "error" in value) {
		return value.error;
	}
	return { kind: "unknown", message: String(textOf(result)) };
}
