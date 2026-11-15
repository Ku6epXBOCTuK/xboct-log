import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import {
	McpClient,
	ensureBinary,
	errorOf,
	startServer,
	stopServer,
	valueOf,
	waitForHealth,
} from "./lib/mcp.mjs";
import { databaseArg, seedData } from "./lib/seed.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const NODE_APP = process.env.E2E_NODE_APP ?? join(ROOT, ".dev", "node-v0.9.0");
const NODE_PORT = Number(process.env.E2E_NODE_PORT ?? 46982);
const RUST_PORT = Number(process.env.E2E_RUST_PORT ?? 46981);
const VERBOSE = process.env.E2E_VERBOSE === "1";
const RUN = Math.random().toString(36).slice(2, 7);
const PROJECT = `cmp-${RUN}`;
const PREFIX = `C${RUN.slice(0, 5).toUpperCase()}`;
const TAG = `cmp-${RUN}`;
const TAG2 = `cmp2-${RUN}`;

const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANY =
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BACKUP = /^(auto|daily|weekly|manual)-/;
const IGNORED = new Set([
	"client",
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
			PROTOCOL_HEADER: "x-forwarded-proto",
		},
		stdio: ["ignore", "ignore", "pipe"],
	});
	if (VERBOSE) child.stderr.on("data", (chunk) => process.stderr.write(chunk));
	return { child, dataDir: data, base: `http://127.0.0.1:${NODE_PORT}` };
}

const state = { node: {}, rust: {} };
const steps = [];
function step(name, args, assign) {
	steps.push({ name, args, assign });
}

const A = `${PREFIX}-1`;
const B = `${PREFIX}-2`;
const EPIC = `${PREFIX}-3`;
const closeA = `${PREFIX}-6`;
const closeB = `${PREFIX}-7`;

step("projects_create", {
	project_id: PROJECT,
	name: `Compare ${RUN}`,
	prefix: PREFIX,
});
step("scopes_create", { project_id: PROJECT, name: "backend" }, "backend");
step("scopes_create", { project_id: PROJECT, name: "scratch" }, "scratch");
step("tags_create", { name: TAG });
step("tags_create", { name: TAG2 });
step("tasks_create", {
	project_id: PROJECT,
	title: "Alpha",
	tags: [TAG],
	scope: "backend",
	priority: "high",
	status: "open",
});
step("tasks_create", { project_id: PROJECT, title: "Beta", status: "open" });
step("tasks_create", {
	project_id: PROJECT,
	title: "Gamma",
	status: "open",
	is_epic: true,
});
step("tasks_create_many", {
	items: [
		{ project_id: PROJECT, title: "Bulk one", status: "open" },
		{ project_id: PROJECT, title: "Bulk two", status: "backlog" },
	],
});
step("tasks_get", { task_id: A });
step("tasks_get_many", { task_ids: [A, B] });
step("tasks_update", { task_id: B, status: "in-progress", assignee: "me" });
step("tasks_update_many", {
	items: [{ task_id: A, patch: { estimate: "M" } }],
});
step("tasks_add_blocker", { task_id: B, blocked_by: A });
step("tasks_remove_blocker", { task_id: B, blocked_by: A });
step("tasks_add_link", { task_id: A, link_type: "relates_to", target: B });
step("tasks_remove_link", { task_id: A, link_type: "relates_to", target: B });
step(
	"tasks_comments_add",
	{ task_id: A, body: "a **compare** comment" },
	"comment",
);
step("tasks_comments_list", { task_id: A });
step("tasks_comments_edit", (s) => ({
	comment_id: s.comment.id,
	body: "an edited comment",
}));
step("tasks_comments_delete", (s) => ({ comment_id: s.comment.id }));
step("tasks_list", {
	project_id: PROJECT,
	status: ["open", "in-progress"],
	sort: "number",
	order: "asc",
});
step("tasks_list#tag", { project_id: PROJECT, tag: [TAG] });
step("tasks_list#search", { project_id: PROJECT, q: "Bulk", limit: 10 });
step("tasks_options", { project_id: PROJECT });
step("tasks_stats", {});
step("tasks_history", { task_id: A });
step("tasks_revisions_list", { task_id: A });
step("scopes_list", { project_id: PROJECT });
step("scopes_get", (s) => ({ scope_id: s.backend.id }));
step("scopes_update", (s) => ({
	scope_id: s.backend.id,
	patch: { name: "web" },
}));
step("scopes_project_ids", {});
step("tags_list", { project_id: PROJECT });
step("tags_dictionary", {});
step("tags_update", { name: TAG, patch: { archived: true } });
step("tags_rename", { name: TAG2, new_name: `${TAG2}-renamed` });
step(
	"attachments_add",
	{
		task_id: A,
		filename: "compare.txt",
		content_base64: Buffer.from("compare fixture\n").toString("base64"),
	},
	"attachment",
);
step("attachments_list", { task_id: A });
step("attachments_verify", { task_id: A });
step("attachments_delete", (s) => ({
	attachment_id: s.attachment.item.id,
}));
step("attachments_deleted_list", {});
step("attachments_restore", (s) => ({
	attachment_id: s.attachment.item.id,
}));
step("attachments_move", (s) => ({
	attachment_id: s.attachment.item.id,
	task_id: B,
}));
step("attachments_copy", (s) => ({
	attachment_id: s.attachment.item.id,
	task_id: EPIC,
}));
step("attachments_purge", (s) => ({
	attachment_id: s.attachment.item.id,
}));
step("tasks_close", { task_id: B, reason: "fixed" });
step("tasks_create", {
	project_id: PROJECT,
	title: "Close me",
	status: "open",
});
step("tasks_create", {
	project_id: PROJECT,
	title: "Close me too",
	status: "open",
});
step("tasks_close_many", {
	items: [
		{ task_id: closeA, reason: "wontfix" },
		{ task_id: closeB, reason: "fixed" },
	],
});
step("tasks_delete", { task_id: A });
step("tasks_deleted_list", {});
step("tasks_restore", { task_id: A });
step("tasks_move", { task_id: B, project_id: "inbox" });
step("tags_inventory", {});
step("projects_get", { project_id: PROJECT });
step("projects_list", { includeArchived: true, q: PROJECT });
step("projects_update", {
	project_id: PROJECT,
	patch: { name: `Renamed ${RUN}` },
});
step("activity_list", { limit: 20 });
step("backup_create", {}, "backup");
step("backup_list", {});
step("backups_inspect", (s) => ({
	kind: "manual",
	name: basename(s.backup.path),
}));
step("backups_restore", (s) => ({
	kind: "manual",
	name: basename(s.backup.path),
}));
step("scopes_delete", (s) => ({ scope_id: s.scratch.id, dry_run: true }));
step("scopes_delete", (s) => ({ scope_id: s.scratch.id }));

const errors = [
	["tasks_get", { task_id: `${PREFIX}-999` }],
	["tasks_create", { project_id: PROJECT }],
	["tasks_create", { project_id: PROJECT, title: "Bad", priority: "urgent" }],
	["tasks_get", { task_id: A, nonsense: true }],
	["scopes_get", { scope_id: 999999 }],
	["tasks_comments_delete", { comment_id: "missing" }],
];

ensureBinary();
const source = databaseArg();
console.log(source ? `seed: ${source}` : "seed: empty database");
rmSync(join(ROOT, ".dev", "e2e", "rust-compare"), {
	recursive: true,
	force: true,
});
rmSync(join(ROOT, ".dev", "e2e", "node-compare"), {
	recursive: true,
	force: true,
});
await seedData(join(ROOT, ".dev", "e2e", "rust-compare"), source);
await seedData(join(ROOT, ".dev", "e2e", "node-compare"), source);
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

	for (const entry of steps) {
		if (!nodeNames.has(entry.name)) {
			console.log(`skip ${entry.name} (rust only)`);
			continue;
		}
		const nodeArgs =
			typeof entry.args === "function" ? entry.args(state.node) : entry.args;
		const rustArgs =
			typeof entry.args === "function" ? entry.args(state.rust) : entry.args;
		const [nodeResult, rustResult] = await Promise.all([
			nodeClient.callTool(entry.name, nodeArgs),
			rustClient.callTool(entry.name, rustArgs),
		]);
		if (entry.assign) {
			state.node[entry.assign] = valueOf(nodeResult);
			state.rust[entry.assign] = valueOf(rustResult);
		}
		const nodeValue = normalize("", valueOf(nodeResult));
		const rustValue = normalize("", valueOf(rustResult));
		const problems = diff(nodeValue, rustValue);
		if (problems.length === 0) {
			console.log(`ok   ${entry.name}`);
			continue;
		}
		failures += 1;
		console.log(`DIFF ${entry.name}`);
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
