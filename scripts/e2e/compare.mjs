import { execSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	McpClient,
	ensureBinary,
	errorOf,
	startServer,
	stopServer,
	valueOf,
	waitForHealth,
} from "./lib/mcp.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const NODE_APP = process.env.E2E_NODE_APP ?? join(ROOT, ".dev", "node-v0.9.0");
const NODE_PORT = Number(process.env.E2E_NODE_PORT ?? 46982);
const RUST_PORT = Number(process.env.E2E_RUST_PORT ?? 46981);
const VERBOSE = process.env.E2E_VERBOSE === "1";

const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANY =
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BACKUP = /^(auto|daily|weekly|manual)-/;
const IGNORED = new Set([
	"created_at",
	"updated_at",
	"deleted_at",
	"edited_at",
	"closed_at",
	"ts",
	"mtime",
	"size",
]);
const PATH_KEYS = new Set(["path", "file_path", "stored_name", "dir"]);

function normalize(key, value) {
	if (typeof value === "string" && DATE.test(value)) return "<date>";
	if (typeof value === "string" && UUID.test(value)) return "<uuid>";
	if (typeof value === "string" && BACKUP.test(value)) return "<backup>";
	if (typeof value === "string" && UUID_ANY.test(value)) {
		UUID_ANY.lastIndex = 0;
		return value.replace(UUID_ANY, "<uuid>");
	}
	UUID_ANY.lastIndex = 0;
	if (Array.isArray(value)) return value.map((item) => normalize(key, item));
	if (value && typeof value === "object") {
		const result = {};
		for (const [child, item] of Object.entries(value)) {
			if (IGNORED.has(child)) continue;
			if (PATH_KEYS.has(child) && typeof item === "string") {
				result[child] = "<path>";
				continue;
			}
			result[child] = normalize(child, item);
		}
		return result;
	}
	return value;
}

function diff(left, right, path = "") {
	if (JSON.stringify(left) === JSON.stringify(right)) return [];
	if (
		typeof left !== "object" ||
		typeof right !== "object" ||
		left === null ||
		right === null
	) {
		return [
			`${path}: node=${JSON.stringify(left)} rust=${JSON.stringify(right)}`,
		];
	}
	const problems = [];
	for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
		problems.push(
			...diff(left[key], right[key], path ? `${path}.${key}` : key),
		);
	}
	return problems;
}

function startNode() {
	const data = join(ROOT, ".dev", "e2e", "node-compare");
	rmSync(data, { recursive: true, force: true });
	mkdirSync(data, { recursive: true });
	const child = spawn(process.execPath, ["build"], {
		cwd: NODE_APP,
		env: {
			...process.env,
			PORT: String(NODE_PORT),
			HOST: "127.0.0.1",
			XBOCT_LOG_DB: join(data, "xboct-log.db"),
			XBOCT_LOG_MIGRATIONS: join(NODE_APP, "migrations"),
			XBOCT_LOG_MEDIA_DIR: join(data, "media"),
			XBOCT_LOG_BACKUP_DIR: join(data, "backups"),
			XBOCT_LOG_BACKUP_DISABLED: "1",
		},
		stdio: ["ignore", "ignore", "pipe"],
	});
	if (VERBOSE) child.stderr.on("data", (chunk) => process.stderr.write(chunk));
	return { child, dataDir: data, base: `http://127.0.0.1:${NODE_PORT}` };
}

const steps = [
	[
		"projects_create",
		{ project_id: "compare", name: "Compare", prefix: "CMP" },
	],
	["scopes_create", { project_id: "compare", name: "backend" }],
	["tags_create", { name: "compare" }],
	[
		"tasks_create",
		{
			project_id: "compare",
			title: "Alpha",
			tags: ["compare"],
			scope: "backend",
			priority: "high",
			status: "open",
		},
	],
	["tasks_create", { project_id: "compare", title: "Beta" }],
	["tasks_create", { project_id: "compare", title: "Gamma", is_epic: true }],
	["tasks_get", { task_id: "CMP-1" }],
	["tasks_update", { task_id: "CMP-2", status: "in-progress", assignee: "me" }],
	["tasks_add_blocker", { task_id: "CMP-2", blocked_by: "CMP-1" }],
	[
		"tasks_add_link",
		{ task_id: "CMP-1", link_type: "relates_to", target: "CMP-2" },
	],
	["tasks_comments_add", { task_id: "CMP-1", body: "a **compare** comment" }],
	["tasks_comments_list", { task_id: "CMP-1" }],
	["tasks_update", { task_id: "CMP-2", epic_id: "CMP-3" }],
	[
		"tasks_list",
		{
			project_id: "compare",
			status: ["open", "in-progress"],
			sort: "number",
			order: "asc",
		},
	],
	["tasks_options", { project_id: "compare" }],
	["tasks_stats", {}],
	["scopes_list", { project_id: "compare" }],
	["tags_inventory", {}],
	["tasks_history", { task_id: "CMP-1" }],
	["tasks_revisions_list", { task_id: "CMP-1" }],
	[
		"attachments_add",
		{
			task_id: "CMP-1",
			filename: "compare.txt",
			content_base64: Buffer.from("compare fixture\n").toString("base64"),
		},
	],
	["attachments_list", { task_id: "CMP-1" }],
	["attachments_verify", { task_id: "CMP-1" }],
	["tasks_close", { task_id: "CMP-2", reason: "fixed" }],
	["tasks_close", { task_id: "CMP-3", reason: "wontfix" }],
	["tasks_delete", { task_id: "CMP-1" }],
	["tasks_deleted_list", {}],
	["tasks_restore", { task_id: "CMP-1" }],
	["tasks_move", { task_id: "CMP-2", project_id: "inbox" }],
	["backup_create", {}],
	["backup_list", {}],
];

const errors = [
	["tasks_get", { task_id: "CMP-999" }],
	["tasks_create", { project_id: "compare" }],
	["tasks_create", { project_id: "compare", title: "Bad", priority: "urgent" }],
	["tasks_get", { task_id: "CMP-1", nonsense: true }],
];

ensureBinary();
rmSync(join(ROOT, ".dev", "e2e", "rust-compare"), {
	recursive: true,
	force: true,
});
rmSync(join(ROOT, ".dev", "e2e", "node-compare"), {
	recursive: true,
	force: true,
});
const rust = startServer({
	port: RUST_PORT,
	dataDir: join(ROOT, ".dev", "e2e", "rust-compare"),
	env: { XBOCT_LOG_BACKUP_DISABLED: "1" },
});
const node = startNode();
await Promise.all([waitForHealth(node.base), waitForHealth(rust.base)]);

let failures = 0;
try {
	const nodeClient = new McpClient(node.base);
	const rustClient = new McpClient(rust.base);
	const [nodeInit, rustInit] = await Promise.all([
		nodeClient.initialize(),
		rustClient.initialize(),
	]);
	const serverInfo = diff(
		{ name: nodeInit.serverInfo?.name, version: nodeInit.serverInfo?.version },
		{ name: rustInit.serverInfo?.name, version: rustInit.serverInfo?.version },
	);
	if (serverInfo.length > 0) {
		failures += serverInfo.length;
		console.log("initialize differs:");
		for (const line of serverInfo) console.log(`  ${line}`);
	}

	const nodeTools = await nodeClient.listTools();
	const rustTools = await rustClient.listTools();
	const nodeNames = new Set(nodeTools.map((tool) => tool.name));
	const rustNames = new Set(rustTools.map((tool) => tool.name));
	console.log(`tools: node ${nodeTools.length}, rust ${rustTools.length}`);
	for (const name of nodeNames)
		if (!rustNames.has(name)) console.log(`  only node: ${name}`);
	for (const name of rustNames)
		if (!nodeNames.has(name)) console.log(`  only rust: ${name}`);

	for (const [name, args] of steps) {
		if (!nodeNames.has(name)) {
			console.log(`skip ${name} (rust only)`);
			continue;
		}
		const [nodeResult, rustResult] = await Promise.all([
			nodeClient.callTool(name, args),
			rustClient.callTool(name, args),
		]);
		const nodeValue = normalize("", valueOf(nodeResult));
		const rustValue = normalize("", valueOf(rustResult));
		const problems = diff(nodeValue, rustValue);
		if (problems.length === 0) {
			console.log(`ok   ${name}`);
			continue;
		}
		failures += 1;
		console.log(`DIFF ${name}`);
		console.log(`  node: ${JSON.stringify(nodeValue)}`);
		console.log(`  rust: ${JSON.stringify(rustValue)}`);
		for (const line of problems.slice(0, 10)) console.log(`  ${line}`);
	}

	for (const [name, args] of errors) {
		const [nodeResult, rustResult] = await Promise.all([
			nodeClient.callTool(name, args),
			rustClient.callTool(name, args),
		]);
		const nodeValue = normalize("", errorOf(nodeResult));
		const rustValue = normalize("", errorOf(rustResult));
		const problems = diff(nodeValue, rustValue);
		if (problems.length === 0) {
			console.log(`ok   ${name} error`);
			continue;
		}
		failures += 1;
		console.log(`DIFF ${name} error`);
		for (const line of problems.slice(0, 10)) console.log(`  ${line}`);
	}
} finally {
	stopServer(rust, { keep: true });
	stopServer(node, { keep: true });
}

console.log(failures === 0 ? "parity: ok" : `parity: ${failures} differences`);
process.exitCode = failures === 0 ? 0 : 1;
