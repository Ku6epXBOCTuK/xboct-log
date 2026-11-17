import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
	ensureBinary,
	errorOf,
	McpClient,
	startServer,
	stopServer,
	textOf,
	valueOf,
	waitForHealth,
} from "./lib/mcp.mjs";
import { databaseArg, seedData } from "./lib/seed.mjs";

const PORT = Number(process.env.E2E_MCP_PORT ?? 47281);
const B64 = Buffer.from("hello from the e2e suite\n").toString("base64");
const failures = [];
let passed = 0;

function idOf(task) {
	return task.id ?? task.key;
}

async function check(label, run) {
	try {
		await run();
		passed += 1;
		console.log(`  ok ${label}`);
	} catch (error) {
		failures.push({ label, error });
		console.log(`  FAIL ${label}`);
		console.log(`       ${error.message.split("\n").join("\n       ")}`);
	}
}

function ok(result, label) {
	assert.notEqual(
		result.isError,
		true,
		`${label}: ${JSON.stringify(valueOf(result))}`,
	);
	return valueOf(result);
}

function failed(result, label) {
	assert.equal(
		result.isError,
		true,
		`${label}: expected an error, got ${JSON.stringify(valueOf(result))}`,
	);
	return errorOf(result);
}

function items(value, label) {
	const list = Array.isArray(value) ? value : value?.items;
	assert.ok(
		Array.isArray(list),
		`${label}: expected items, got ${JSON.stringify(value)}`,
	);
	return list;
}

ensureBinary();
const dataDir = join(process.cwd(), ".dev", "e2e", "mcp-data");
rmSync(dataDir, { recursive: true, force: true });
const source = databaseArg();
if (source) console.log(`[e2e] seeding from ${source}`);
await seedData(dataDir, source);
const server = startServer({ port: PORT, dataDir });
const client = new McpClient(server.base);

try {
	await waitForHealth(server.base);
	const init = await client.initialize();
	console.log(
		`mcp e2e against ${server.base}, protocol ${init.protocolVersion}`,
	);
	const tools = await client.listTools();
	const calledTools = new Set();
	const rawCall = client.callTool.bind(client);
	client.callTool = async (name, args = {}) => {
		calledTools.add(name);
		return rawCall(name, args);
	};

	await check("tools/list exposes every registered tool", () => {
		assert.equal(tools.length, 55);
		const names = new Set(tools.map((tool) => tool.name));
		for (const name of [
			"tasks_create",
			"attachments_read",
			"backup_create",
			"scopes_delete",
		]) {
			assert.ok(names.has(name), `${name} is missing`);
		}
	});

	console.log("\nsetup");
	await check("projects_create", async () => {
		const project = ok(
			await client.callTool("projects_create", {
				project_id: "e2e",
				name: "E2E",
				prefix: "E2E",
			}),
			"projects_create",
		);
		assert.equal(project.id, "e2e");
	});
	await check("projects_create the second project", async () => {
		ok(
			await client.callTool("projects_create", {
				project_id: "aux",
				name: "Aux",
				prefix: "AUX",
			}),
			"projects_create aux",
		);
	});
	await check("tags_create", async () => {
		const tag = ok(
			await client.callTool("tags_create", { name: "e2e-tag" }),
			"tags_create",
		);
		assert.equal(tag.name, "e2e-tag");
	});
	await check("tags_update", async () => {
		const tag = ok(
			await client.callTool("tags_update", {
				name: "e2e-tag",
				archived: false,
			}),
			"tags_update",
		);
		assert.equal(tag.archived, false);
	});
	await check("tags_rename", async () => {
		const tag = ok(
			await client.callTool("tags_rename", {
				name: "e2e-tag",
				new_name: "e2e-renamed",
			}),
			"tags_rename",
		);
		assert.equal(tag.name, "e2e-renamed");
	});
	await check("scopes_create", async () => {
		const scope = ok(
			await client.callTool("scopes_create", {
				project_id: "e2e",
				name: "backend",
			}),
			"scopes_create",
		);
		assert.equal(scope.name, "backend");
	});

	let root;
	let child;
	let epic;
	let blocked;
	let batchA;
	let batchB;
	await check("tasks_create", async () => {
		root = ok(
			await client.callTool("tasks_create", {
				project_id: "e2e",
				title: "Root task",
				description: "first description",
				priority: "high",
				scope: "backend",
				tags: ["e2e-renamed"],
				estimate: "M",
				assignee: "me",
			}),
			"tasks_create root",
		);
		assert.equal(root.title, "Root task");
		assert.equal(root.project_id, "e2e");
	});
	await check("tasks_create a child and an epic", async () => {
		child = ok(
			await client.callTool("tasks_create", {
				project_id: "e2e",
				title: "Child task",
				estimate: "S",
			}),
			"tasks_create child",
		);
		epic = ok(
			await client.callTool("tasks_create", {
				project_id: "e2e",
				title: "Epic task",
				is_epic: true,
			}),
			"tasks_create epic",
		);
		assert.equal(epic.is_epic, true);
	});
	await check("tasks_create a blocked task", async () => {
		blocked = ok(
			await client.callTool("tasks_create", {
				project_id: "e2e",
				title: "Blocked task",
				status: "blocked",
				blocked_reason: "waiting",
			}),
			"tasks_create blocked",
		);
		assert.equal(blocked.status, "blocked");
	});
	await check("tasks_create_many", async () => {
		const batch = ok(
			await client.callTool("tasks_create_many", {
				items: [
					{ project_id: "e2e", title: "Batch A" },
					{ project_id: "e2e", title: "Batch B" },
				],
			}),
			"tasks_create_many",
		);
		const created = items(batch, "tasks_create_many");
		assert.equal(created.length, 2);
		batchA = created[0].task;
		batchB = created[1].task;
		assert.equal(batchA.title, "Batch A");
	});

	console.log("\nreads");
	await check("tasks_get", async () => {
		const task = ok(
			await client.callTool("tasks_get", { task_id: idOf(root) }),
			"tasks_get",
		);
		assert.equal(task.title, "Root task");
	});
	await check("tasks_get_many reports the missing id", async () => {
		const result = ok(
			await client.callTool("tasks_get_many", {
				task_ids: [idOf(root), idOf(child), "E2E-9999"],
			}),
			"tasks_get_many",
		);
		assert.equal(items(result, "tasks_get_many").length, 2);
		assert.deepEqual(result.missing, ["E2E-9999"]);
	});
	await check("tasks_list filters by tag and project", async () => {
		const page = ok(
			await client.callTool("tasks_list", {
				project_id: "e2e",
				tag: "e2e-renamed",
			}),
			"tasks_list tag",
		);
		assert.equal(page.total, 1);
		assert.equal(page.items[0].id, idOf(root));
	});
	await check("tasks_list filters by status and sorts", async () => {
		const page = ok(
			await client.callTool("tasks_list", {
				project_id: "e2e",
				status: ["blocked"],
				sort: "number",
				order: "asc",
				limit: 10,
			}),
			"tasks_list status",
		);
		assert.equal(page.items.length, 1);
		assert.equal(page.items[0].id, idOf(blocked));
	});
	await check("tasks_options", async () => {
		const result = ok(
			await client.callTool("tasks_options", { project_id: "e2e", q: "Root" }),
			"tasks_options",
		);
		assert.ok(
			items(result, "tasks_options").some((item) => item.id === idOf(root)),
		);
	});
	await check("tags_list", async () => {
		const page = ok(
			await client.callTool("tags_list", { project_id: "e2e" }),
			"tags_list",
		);
		assert.ok(
			items(page, "tags_list").some((item) => item.tag === "e2e-renamed"),
		);
	});
	await check("tags_dictionary", async () => {
		const result = ok(
			await client.callTool("tags_dictionary", {}),
			"tags_dictionary",
		);
		assert.ok(result.items.includes("e2e-renamed"));
	});
	await check("projects_get", async () => {
		const project = ok(
			await client.callTool("projects_get", { project_id: "e2e" }),
			"projects_get",
		);
		assert.equal(project.name, "E2E");
	});
	await check("projects_list", async () => {
		const result = ok(
			await client.callTool("projects_list", { includeArchived: true }),
			"projects_list",
		);
		assert.ok(items(result, "projects_list").some((item) => item.id === "e2e"));
	});
	await check("scopes_list", async () => {
		const result = ok(
			await client.callTool("scopes_list", { project_id: "e2e" }),
			"scopes_list",
		);
		const scope = items(result, "scopes_list").find(
			(item) => item.name === "backend",
		);
		assert.ok(scope, "backend scope is missing");
	});
	await check("scopes_project_ids", async () => {
		const result = ok(
			await client.callTool("scopes_project_ids", {}),
			"scopes_project_ids",
		);
		assert.ok(items(result, "scopes_project_ids").includes("e2e"));
	});
	await check("scopes_get", async () => {
		const list = ok(
			await client.callTool("scopes_list", { project_id: "e2e" }),
			"scopes_list",
		);
		const scope = items(list, "scopes_list").find(
			(item) => item.name === "backend",
		);
		const found = ok(
			await client.callTool("scopes_get", { scope_id: scope.id }),
			"scopes_get",
		);
		assert.equal(found.name, "backend");
	});

	console.log("\nupdates");
	await check("tasks_update", async () => {
		const result = ok(
			await client.callTool("tasks_update", {
				task_id: idOf(child),
				priority: "critical",
				assignee: "you",
			}),
			"tasks_update",
		);
		const task = result.item ?? result;
		assert.equal(task.priority, "critical");
		assert.equal(task.assignee, "you");
	});
	await check("tasks_update_many", async () => {
		const result = ok(
			await client.callTool("tasks_update_many", {
				items: [{ task_id: idOf(batchA), title: "Batch A renamed" }],
			}),
			"tasks_update_many",
		);
		const first = items(result, "tasks_update_many")[0].task;
		assert.equal(first.title, "Batch A renamed");
	});
	await check("tasks_add_blocker and tasks_remove_blocker", async () => {
		ok(
			await client.callTool("tasks_add_blocker", {
				task_id: idOf(blocked),
				blocked_by: idOf(child),
			}),
			"tasks_add_blocker",
		);
		const removed = ok(
			await client.callTool("tasks_remove_blocker", {
				task_id: idOf(blocked),
				blocked_by: idOf(child),
			}),
			"tasks_remove_blocker",
		);
		const task = removed.item ?? removed;
		assert.deepEqual(task.blocked_by ?? [], []);
	});
	await check("tasks_add_link and tasks_remove_link", async () => {
		ok(
			await client.callTool("tasks_add_link", {
				task_id: idOf(root),
				link_type: "relates_to",
				target: idOf(child),
			}),
			"tasks_add_link",
		);
		ok(
			await client.callTool("tasks_remove_link", {
				task_id: idOf(root),
				link_type: "relates_to",
				target: idOf(child),
			}),
			"tasks_remove_link",
		);
	});
	await check("tasks_move", async () => {
		const result = ok(
			await client.callTool("tasks_move", {
				task_id: idOf(batchA),
				project_id: "aux",
			}),
			"tasks_move",
		);
		const task = result.item ?? result;
		assert.equal(task.project_id, "aux");
		batchA = task;
	});

	console.log("\ncomments, history, activity, stats");
	await check("tasks_comments_add, list, edit and delete", async () => {
		const added = ok(
			await client.callTool("tasks_comments_add", {
				task_id: idOf(root),
				body: "first **comment**",
			}),
			"tasks_comments_add",
		);
		const list = ok(
			await client.callTool("tasks_comments_list", { task_id: idOf(root) }),
			"tasks_comments_list",
		);
		assert.ok(
			items(list, "tasks_comments_list").some((item) => item.id === added.id),
		);
		const edited = ok(
			await client.callTool("tasks_comments_edit", {
				comment_id: added.id,
				body: "edited comment",
			}),
			"tasks_comments_edit",
		);
		assert.equal(edited.body, "edited comment");
		ok(
			await client.callTool("tasks_comments_delete", { comment_id: added.id }),
			"tasks_comments_delete",
		);
		const after = ok(
			await client.callTool("tasks_comments_list", { task_id: idOf(root) }),
			"tasks_comments_list after delete",
		);
		assert.equal(
			items(after, "tasks_comments_list").some((item) => item.id === added.id),
			false,
		);
	});
	await check("tasks_revisions_list", async () => {
		ok(
			await client.callTool("tasks_update", {
				task_id: idOf(root),
				description: "second description",
			}),
			"tasks_update description",
		);
		const revisions = ok(
			await client.callTool("tasks_revisions_list", {
				task_id: idOf(root),
				field: "description",
			}),
			"tasks_revisions_list",
		);
		assert.ok(items(revisions, "tasks_revisions_list").length >= 1);
	});
	await check("tasks_history", async () => {
		const history = ok(
			await client.callTool("tasks_history", { task_id: idOf(root) }),
			"tasks_history",
		);
		assert.ok(items(history, "tasks_history").length >= 1);
	});
	await check("activity_list", async () => {
		const activity = ok(
			await client.callTool("activity_list", { entity: "task", limit: 50 }),
			"activity_list",
		);
		assert.ok(items(activity, "activity_list").length >= 1);
		assert.ok(activity.ops.length >= 1);
	});
	await check("request_log_list", async () => {
		const log = ok(
			await client.callTool("request_log_list", {
				op: "tasks_list",
				limit: 50,
			}),
			"request_log_list",
		);
		assert.ok(log.total >= 1);
		assert.ok(log.items.some((item) => item.op === "tasks_list"));
	});
	await check("request_log_export", async () => {
		const exported = ok(
			await client.callTool("request_log_export", { limit: 100 }),
			"request_log_export",
		);
		assert.ok(exported.count >= 1);
		assert.equal(exported.content.trim().split("\n").length, exported.count);
	});
	await check("tasks_stats", async () => {
		const stats = ok(await client.callTool("tasks_stats", {}), "tasks_stats");
		assert.ok(stats.tasks.open >= 1);
	});

	console.log("\nattachments");
	let attachment;
	await check("attachments_add", async () => {
		const result = ok(
			await client.callTool("attachments_add", {
				task_id: idOf(root),
				filename: "note.txt",
				content_base64: B64,
			}),
			"attachments_add",
		);
		attachment = result.item;
		assert.equal(attachment.file_name, "note.txt");
	});
	await check("attachments_list", async () => {
		const result = ok(
			await client.callTool("attachments_list", { task_id: idOf(root) }),
			"attachments_list",
		);
		assert.ok(
			items(result, "attachments_list").some(
				(item) => item.id === attachment.id,
			),
		);
	});
	await check("attachments_verify", async () => {
		const result = ok(
			await client.callTool("attachments_verify", { task_id: idOf(root) }),
			"attachments_verify",
		);
		assert.ok(Array.isArray(result.ok));
		assert.deepEqual(result.missing, []);
	});
	await check("attachments_read", async () => {
		const result = await client.callTool("attachments_read", {
			attachment_id: attachment.id,
		});
		assert.notEqual(result.isError, true);
		assert.match(textOf(result), /hello from the e2e suite/);
	});
	await check("attachments_move", async () => {
		const result = ok(
			await client.callTool("attachments_move", {
				attachment_id: attachment.id,
				task_id: idOf(child),
			}),
			"attachments_move",
		);
		assert.equal(result.item.task_id, idOf(child));
		assert.equal(result.previous_task_id, idOf(root));
	});
	let copy;
	await check("attachments_copy", async () => {
		const result = ok(
			await client.callTool("attachments_copy", {
				attachment_id: attachment.id,
				task_id: idOf(root),
			}),
			"attachments_copy",
		);
		copy = result.item;
		assert.notEqual(copy.id, attachment.id);
	});
	await check("attachments_delete and deleted_list and restore", async () => {
		ok(
			await client.callTool("attachments_delete", { attachment_id: copy.id }),
			"attachments_delete",
		);
		const deleted = ok(
			await client.callTool("attachments_deleted_list", {
				task_id: idOf(root),
			}),
			"attachments_deleted_list",
		);
		assert.ok(
			items(deleted, "attachments_deleted_list").some(
				(item) => item.id === copy.id,
			),
		);
		const restored = ok(
			await client.callTool("attachments_restore", { attachment_id: copy.id }),
			"attachments_restore",
		);
		assert.equal(restored.deleted_at, null);
	});
	await check("attachments_purge", async () => {
		ok(
			await client.callTool("attachments_delete", { attachment_id: copy.id }),
			"attachments_delete before purge",
		);
		const result = ok(
			await client.callTool("attachments_purge", { attachment_id: copy.id }),
			"attachments_purge",
		);
		assert.equal(result.id, copy.id);
		assert.equal(result.file_removed, true);
	});

	console.log("\nbackups");
	let backupName;
	await check("backup_create", async () => {
		const result = ok(
			await client.callTool("backup_create", {}),
			"backup_create",
		);
		assert.ok(result.path.endsWith(".db"), `unexpected path ${result.path}`);
		backupName = result.path;
	});
	await check("backup_list", async () => {
		const result = ok(await client.callTool("backup_list", {}), "backup_list");
		const names = items(result, "backup_list").map((item) => item.path);
		assert.ok(names.includes(backupName), "the fresh backup is not listed");
	});

	console.log("\nscopes and projects cleanup path");
	await check("scopes_update", async () => {
		const list = ok(
			await client.callTool("scopes_list", { project_id: "e2e" }),
			"scopes_list",
		);
		const scope = items(list, "scopes_list").find(
			(item) => item.name === "backend",
		);
		const updated = ok(
			await client.callTool("scopes_update", {
				scope_id: scope.id,
				name: "api",
			}),
			"scopes_update",
		);
		assert.equal(updated.name, "api");
	});
	await check("scopes_delete dry_run", async () => {
		const list = ok(
			await client.callTool("scopes_list", { project_id: "e2e" }),
			"scopes_list",
		);
		const scope = items(list, "scopes_list").find(
			(item) => item.name === "api",
		);
		const report = ok(
			await client.callTool("scopes_delete", {
				scope_id: scope.id,
				dry_run: true,
			}),
			"scopes_delete",
		);
		assert.equal(report.dry_run, true);
		assert.ok(Array.isArray(report.task_ids));
	});
	await check("projects_update", async () => {
		const project = ok(
			await client.callTool("projects_update", {
				project_id: "e2e",
				name: "E2E renamed",
			}),
			"projects_update",
		);
		assert.equal(project.name, "E2E renamed");
	});

	console.log("\nclosing and deletion");
	await check("tasks_close", async () => {
		const result = ok(
			await client.callTool("tasks_close", {
				task_id: idOf(blocked),
				reason: "fixed",
			}),
			"tasks_close",
		);
		const task = result.item ?? result;
		assert.equal(task.status, "done");
	});
	await check("tasks_close_many", async () => {
		ok(
			await client.callTool("tasks_close_many", {
				items: [{ task_id: idOf(batchB), reason: "wontfix" }],
			}),
			"tasks_close_many",
		);
	});
	await check("tasks_delete", async () => {
		ok(
			await client.callTool("tasks_delete", { task_id: idOf(batchA) }),
			"tasks_delete",
		);
	});
	await check("tasks_deleted_list", async () => {
		const result = ok(
			await client.callTool("tasks_deleted_list", { project_id: "aux" }),
			"tasks_deleted_list",
		);
		assert.ok(
			items(result, "tasks_deleted_list").some(
				(item) => item.id === idOf(batchA),
			),
		);
	});
	await check("tasks_restore", async () => {
		const restored = ok(
			await client.callTool("tasks_restore", { task_id: idOf(batchA) }),
			"tasks_restore",
		);
		const task = restored.item ?? restored;
		assert.equal(task.deleted_at ?? null, null);
	});

	console.log("\nresources");
	await check(
		"resources/list exposes the index and the attachment",
		async () => {
			const resources = await client.listResources();
			const uris = resources.map((item) => item.uri);
			assert.ok(uris.includes("xboct-log://attachments"));
			assert.ok(uris.includes(`xboct-log://attachment/${attachment.id}`));
		},
	);
	await check("resources/read returns the attachment index", async () => {
		const contents = await client.readResource("xboct-log://attachments");
		const listed = JSON.parse(contents[0].text);
		assert.ok(Array.isArray(listed));
		assert.ok(listed.some((item) => item.id === attachment.id));
	});
	await check("resources/read returns the attachment bytes", async () => {
		const contents = await client.readResource(
			`xboct-log://attachment/${attachment.id}`,
		);
		assert.equal(
			Buffer.from(contents[0].blob, "base64").toString("utf8"),
			"hello from the e2e suite\n",
		);
	});

	console.log("\nerrors");
	await check("an unknown argument is rejected with a hint", async () => {
		const error = failed(
			await client.callTool("tasks_get", { task_id: idOf(root), nope: 1 }),
			"unknown argument",
		);
		assert.match(error.message, /nope/);
	});
	await check("a missing required argument is rejected", async () => {
		const error = failed(
			await client.callTool("tasks_create", { project_id: "e2e" }),
			"missing title",
		);
		assert.match(error.message, /title/);
	});
	await check("an invalid enum is rejected", async () => {
		const error = failed(
			await client.callTool("tasks_create", {
				project_id: "e2e",
				title: "Bad priority",
				priority: "urgent",
			}),
			"invalid enum",
		);
		assert.match(
			error.message,
			/priority: Invalid option: expected one of "low"\|"medium"\|"high"\|"critical"/,
		);
	});
	await check("a missing task is a not found error", async () => {
		const error = failed(
			await client.callTool("tasks_get", { task_id: "E2E-9999" }),
			"not found",
		);
		assert.equal(error.kind, "not_found");
	});
	await check("an unknown tool is rejected", async () => {
		let message;
		try {
			const result = await client.callTool("tasks_nope", {});
			assert.equal(result.isError, true);
			message = errorOf(result).message;
		} catch (error) {
			message = error.message;
		}
		assert.match(message, /nope|unknown|not found/i);
	});

	await check("every listed tool is exercised", () => {
		const missing = tools
			.map((tool) => tool.name)
			.filter((name) => !calledTools.has(name));
		assert.deepEqual(missing, [], `never called: ${missing.join(", ")}`);
	});

	const errors = failures.length;
	console.log(`\n${passed} passed, ${errors} failed`);
	if (errors > 0) {
		for (const failure of failures) {
			console.log(`- ${failure.label}: ${failure.error.message}`);
		}
		process.exitCode = 1;
	}
} finally {
	stopServer(server);
}
