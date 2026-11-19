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
		assert.equal(tools.length, 83);
		const names = new Set(tools.map((tool) => tool.name));
		for (const name of [
			"tasks_create",
			"attachments_read",
			"backup_create",
			"scopes_delete",
			"plans_create",
			"plans_reorder",
			"plans_notes_restore",
			"plans_notes_deleted_list",
			"plans_notes_revisions_list",
			"documents_create",
			"plans_documents_link",
		]) {
			assert.ok(names.has(name), `${name} is missing`);
		}
		const plansList = tools.find((tool) => tool.name === "plans_list");
		assert.ok(plansList, "plans_list is missing");
		assert.match(plansList.description, /tasks_list/);
		assert.doesNotMatch(
			plansList.description,
			/plans_get for one plan's items/,
		);
		assert.match(plansList.description, /include_deleted/);
		const documentsList = tools.find((tool) => tool.name === "documents_list");
		assert.ok(documentsList, "documents_list is missing");
		assert.match(documentsList.description, /short_body/);
		assert.match(documentsList.description, /include_body/);
		assert.match(documentsList.description, /total/);
		assert.match(documentsList.description, /kind/);
		assert.match(documentsList.description, /status/);
		assert.match(documentsList.description, /q/);
		assert.match(documentsList.description, /sort/);
		assert.match(documentsList.description, /deleted_only/);
		const tasksGet = tools.find((tool) => tool.name === "tasks_get");
		assert.ok(tasksGet, "tasks_get is missing");
		assert.match(tasksGet.description, /plan_names/);
		const tasksCreate = tools.find((tool) => tool.name === "tasks_create");
		assert.ok(tasksCreate, "tasks_create is missing");
		assert.match(tasksCreate.description, /plan_names/);
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

	console.log("\nplans");
	let plan;
	let planLeft;
	let planRight;
	let note;
	await check("tasks for a plan in two projects", async () => {
		planLeft = ok(
			await client.callTool("tasks_create", {
				project_id: "e2e",
				title: "Plan item E2E",
			}),
			"plan task e2e",
		);
		planRight = ok(
			await client.callTool("tasks_create", {
				project_id: "aux",
				title: "Plan item AUX",
			}),
			"plan task aux",
		);
	});
	await check("plans_create", async () => {
		plan = ok(
			await client.callTool("plans_create", {
				name: "E2E plan",
				description: "items from two projects",
			}),
			"plans_create",
		);
		assert.equal(plan.status, "backlog");
	});
	await check("plans_items_add and plans_list", async () => {
		ok(
			await client.callTool("plans_items_add", {
				plan_id: plan.id,
				task_id: idOf(planLeft),
			}),
			"plans_items_add e2e",
		);
		ok(
			await client.callTool("plans_items_add", {
				plan_id: plan.id,
				task_id: idOf(planRight),
			}),
			"plans_items_add aux",
		);
		const list = ok(await client.callTool("plans_list", {}), "plans_list");
		const listed = items(list, "plans_list").find(
			(item) => item.id === plan.id,
		);
		assert.equal(listed.tasks_count, 2);
	});
	await check("plans_reorder and plans_get", async () => {
		const reordered = ok(
			await client.callTool("plans_reorder", {
				plan_id: plan.id,
				task_ids: [idOf(planRight), idOf(planLeft)],
			}),
			"plans_reorder",
		);
		assert.deepEqual(
			items(reordered, "plans_reorder").map((item) => item.key),
			[idOf(planRight), idOf(planLeft)],
		);
		const detail = ok(
			await client.callTool("plans_get", { plan_id: plan.id }),
			"plans_get",
		);
		assert.equal(detail.tasks_count, 2);
	});
	await check("tasks_list by plan with plan_position sort", async () => {
		const page = ok(
			await client.callTool("tasks_list", {
				plan_id: plan.id,
				sort: "plan_position",
			}),
			"tasks_list by plan",
		);
		assert.deepEqual(
			page.items.map((item) => item.id),
			[idOf(planRight), idOf(planLeft)],
		);
		assert.deepEqual(page.items[0].plan_ids, [plan.id]);
		const named = ok(
			await client.callTool("tasks_list", {
				plan_id: plan.id,
				include_plan_names: true,
				sort: "plan_position",
			}),
			"tasks_list with plan_names",
		);
		assert.deepEqual(named.items[0].plan_names, [
			{ id: plan.id, name: "E2E plan" },
		]);
		const got = ok(
			await client.callTool("tasks_get", { task_id: idOf(planLeft) }),
			"tasks_get with plan_names",
		);
		assert.deepEqual(got.plan_names, [{ id: plan.id, name: "E2E plan" }]);
	});
	await check("plans_notes_add, list and edit", async () => {
		note = ok(
			await client.callTool("plans_notes_add", {
				plan_id: plan.id,
				task_id: idOf(planLeft),
				body: "note before the move",
			}),
			"plans_notes_add",
		);
		const listed = ok(
			await client.callTool("plans_notes_list", { plan_id: plan.id }),
			"plans_notes_list",
		);
		assert.ok(
			items(listed, "plans_notes_list").some((item) => item.id === note.id),
		);
		const edited = ok(
			await client.callTool("plans_notes_edit", {
				note_id: note.id,
				body: "note after the edit",
				expected_edited_at: note.created_at,
			}),
			"plans_notes_edit",
		);
		assert.equal(edited.body, "note after the edit");
		note = edited;
	});
	await check("a task move keeps the plan composition", async () => {
		const moved = ok(
			await client.callTool("tasks_move", {
				task_id: idOf(planLeft),
				project_id: "aux",
			}),
			"tasks_move plan item",
		);
		planLeft = moved.item ?? moved;
		const page = ok(
			await client.callTool("tasks_list", {
				plan_id: plan.id,
				sort: "plan_position",
			}),
			"tasks_list after the move",
		);
		assert.deepEqual(
			page.items.map((item) => item.id),
			[idOf(planRight), idOf(planLeft)],
		);
		const notes = ok(
			await client.callTool("plans_notes_list", { plan_id: plan.id }),
			"plans_notes_list after the move",
		);
		assert.ok(
			items(notes, "plans_notes_list").some(
				(item) => item.key === idOf(planLeft),
			),
		);
		const error = failed(
			await client.callTool("plans_reorder", {
				plan_id: plan.id,
				task_ids: ["E2E-9999", idOf(planRight), idOf(planLeft)],
			}),
			"plans_reorder stale key",
		);
		assert.equal(error.kind, "validation");
	});
	await check(
		"plan note history rejects stale edits and restores",
		async () => {
			const stale = failed(
				await client.callTool("plans_notes_edit", {
					note_id: note.id,
					body: "stale note",
					expected_edited_at: note.created_at,
				}),
				"plans_notes_edit stale",
			);
			assert.equal(stale.kind, "conflict");
			const current = ok(
				await client.callTool("plans_notes_list", { plan_id: plan.id }),
				"plans_notes_list after stale edit",
			);
			assert.equal(
				items(current, "plans_notes_list")[0].body,
				"note after the edit",
			);

			const revisions = ok(
				await client.callTool("plans_notes_revisions_list", {
					note_id: note.id,
				}),
				"plans_notes_revisions_list",
			);
			assert.ok(
				items(revisions, "plans_notes_revisions_list").some(
					(item) => item.body === "note before the move",
				),
			);

			note = ok(
				await client.callTool("plans_notes_edit", {
					note_id: note.id,
					body: "note after the stale check",
					expected_edited_at: note.edited_at,
				}),
				"plans_notes_edit with current version",
			);
			ok(
				await client.callTool("plans_notes_delete", { note_id: note.id }),
				"plans_notes_delete before restore",
			);
			assert.ok(
				items(
					ok(
						await client.callTool("plans_notes_list", { plan_id: plan.id }),
						"plans_notes_list after delete",
					),
					"plans_notes_list after delete",
				).length === 0,
			);
			const deleted = ok(
				await client.callTool("plans_notes_deleted_list", { plan_id: plan.id }),
				"plans_notes_deleted_list",
			);
			assert.ok(
				items(deleted, "plans_notes_deleted_list").some(
					(item) => item.id === note.id,
				),
			);
			const later = ok(
				await client.callTool("plans_notes_revisions_list", {
					note_id: note.id,
				}),
				"plans_notes_revisions_list after delete",
			);
			assert.equal(items(later, "plans_notes_revisions_list").length, 2);
			ok(
				await client.callTool("plans_notes_restore", { note_id: note.id }),
				"plans_notes_restore",
			);
			ok(
				await client.callTool("plans_notes_restore", { note_id: note.id }),
				"plans_notes_restore repeat",
			);
			const restored = ok(
				await client.callTool("plans_notes_list", { plan_id: plan.id }),
				"plans_notes_list after restore",
			);
			assert.equal(
				items(restored, "plans_notes_list")[0].body,
				"note after the stale check",
			);
			const remaining = ok(
				await client.callTool("plans_notes_deleted_list", { plan_id: plan.id }),
				"plans_notes_deleted_list after restore",
			);
			assert.equal(items(remaining, "plans_notes_deleted_list").length, 0);
		},
	);
	await check("plans_update", async () => {
		const updated = ok(
			await client.callTool("plans_update", {
				plan_id: plan.id,
				name: "E2E plan renamed",
				status: "active",
				expected_updated_at: plan.updated_at,
			}),
			"plans_update",
		);
		assert.equal(updated.name, "E2E plan renamed");
		assert.equal(updated.status, "active");
	});
	await check("plans_delete, deleted_list and restore", async () => {
		ok(
			await client.callTool("plans_delete", { plan_id: plan.id }),
			"plans_delete",
		);
		const deleted = ok(
			await client.callTool("plans_deleted_list", {}),
			"plans_deleted_list",
		);
		assert.ok(
			items(deleted, "plans_deleted_list").some((item) => item.id === plan.id),
		);
		const active = ok(
			await client.callTool("plans_list", {}),
			"plans_list without deleted",
		);
		assert.ok(!items(active, "plans_list").some((item) => item.id === plan.id));
		const withDeleted = ok(
			await client.callTool("plans_list", { include_deleted: true }),
			"plans_list with deleted",
		);
		assert.ok(
			items(withDeleted, "plans_list").some((item) => item.id === plan.id),
		);
		ok(
			await client.callTool("plans_restore", { plan_id: plan.id }),
			"plans_restore",
		);
		const detail = ok(
			await client.callTool("plans_get", { plan_id: plan.id }),
			"plans_get after restore",
		);
		assert.equal(detail.tasks_count, 2);
	});
	await check("plans_notes_delete and plans_items_remove", async () => {
		ok(
			await client.callTool("plans_notes_delete", { note_id: note.id }),
			"plans_notes_delete",
		);
		ok(
			await client.callTool("plans_items_remove", {
				plan_id: plan.id,
				task_id: idOf(planLeft),
			}),
			"plans_items_remove",
		);
		const detail = ok(
			await client.callTool("plans_get", { plan_id: plan.id }),
			"plans_get after remove",
		);
		assert.equal(detail.tasks_count, 1);
	});

	console.log("\ndocuments");
	let document;
	await check(
		"documents_create, documents_get and documents_list",
		async () => {
			document = ok(
				await client.callTool("documents_create", {
					project_id: "e2e",
					kind: "adr",
					title: "Use sqlite",
					body: "first body",
					source_file: "docs/adr/001.md",
				}),
				"documents_create",
			);
			assert.equal(document.status, "draft");
			const found = ok(
				await client.callTool("documents_get", {
					document_id: document.id,
				}),
				"documents_get",
			);
			assert.equal(found.key, document.key);
			const byKey = ok(
				await client.callTool("documents_get", {
					document_id: document.key,
				}),
				"documents_get by key",
			);
			assert.equal(byKey.id, document.id);
			const list = ok(
				await client.callTool("documents_list", { project_id: "e2e" }),
				"documents_list",
			);
			assert.ok(list.total >= 1);
			const item = items(list, "documents_list").find(
				(entry) => entry.id === document.id,
			);
			assert.equal(item.short_body, "first body");
			assert.equal(item.body, undefined);
			const full = ok(
				await client.callTool("documents_list", {
					project_id: "e2e",
					include_body: true,
					fields: ["id", "body"],
					limit: 1,
				}),
				"documents_list with body",
			);
			assert.equal(full.total, list.total);
			assert.equal(full.items.length, 1);
			assert.equal(full.items[0].body, "first body");
			assert.equal(full.items[0].title, undefined);
			const filtered = ok(
				await client.callTool("documents_list", {
					project_id: ["e2e", "aux"],
					kind: "adr",
					status: "draft",
					q: "ADR/001",
					sort: "title",
					order: "desc",
					fields: ["id", "title", "key"],
				}),
				"documents_list with filters",
			);
			assert.equal(filtered.total, 1);
			assert.equal(filtered.items[0].id, document.id);
			assert.equal(filtered.items[0].title, "Use sqlite");
		},
	);
	await check("documents_update and documents_revisions_list", async () => {
		const stale = document.updated_at;
		const updated = ok(
			await client.callTool("documents_update", {
				document_id: document.id,
				body: "second version",
				status: "accepted",
				expected_updated_at: stale,
			}),
			"documents_update",
		);
		assert.equal(updated.body, "second version");
		assert.equal(updated.status, "accepted");
		document = updated;
		const error = failed(
			await client.callTool("documents_update", {
				document_id: document.id,
				body: "a concurrent edit",
				expected_updated_at: stale,
			}),
			"documents_update stale edit",
		);
		assert.equal(error.kind, "conflict");
		const current = ok(
			await client.callTool("documents_get", {
				document_id: document.id,
			}),
			"documents_get after a stale edit",
		);
		assert.equal(current.body, "second version");
		const revisions = ok(
			await client.callTool("documents_revisions_list", {
				document_id: document.id,
			}),
			"documents_revisions_list",
		);
		assert.ok(
			items(revisions, "documents_revisions_list").some(
				(item) => item.body === "first body",
			),
		);
	});
	await check(
		"plans_documents_link, plans_documents_list and plans_documents_unlink",
		async () => {
			ok(
				await client.callTool("plans_documents_link", {
					plan_id: plan.id,
					document_id: document.key,
				}),
				"plans_documents_link",
			);
			const linked = ok(
				await client.callTool("plans_documents_list", {
					plan_id: plan.id,
				}),
				"plans_documents_list",
			);
			assert.ok(
				items(linked, "plans_documents_list").some(
					(item) => item.id === document.id,
				),
			);
			const preview = items(linked, "plans_documents_list").find(
				(item) => item.id === document.id,
			);
			assert.equal(preview.short_body, "second version");
			assert.equal(preview.body, undefined);
			const withBody = ok(
				await client.callTool("plans_documents_list", {
					plan_id: plan.id,
					include_body: true,
				}),
				"plans_documents_list with body",
			);
			assert.equal(
				items(withBody, "plans_documents_list").find(
					(item) => item.id === document.id,
				).body,
				"second version",
			);
			ok(
				await client.callTool("plans_documents_unlink", {
					plan_id: plan.id,
					document_id: document.key.toLowerCase(),
				}),
				"plans_documents_unlink",
			);
			const after = ok(
				await client.callTool("plans_documents_list", {
					plan_id: plan.id,
				}),
				"plans_documents_list after unlink",
			);
			assert.ok(
				!items(after, "plans_documents_list").some(
					(item) => item.id === document.id,
				),
			);
		},
	);
	await check(
		"a cross-project document link survives a task move",
		async () => {
			const foreign = ok(
				await client.callTool("documents_create", {
					project_id: "aux",
					kind: "spec",
					title: "Decision from another project",
					body: "linked across projects",
				}),
				"documents_create in aux",
			);
			ok(
				await client.callTool("plans_documents_link", {
					plan_id: plan.id,
					document_id: foreign.id,
				}),
				"plans_documents_link across projects",
			);
			ok(
				await client.callTool("tasks_move", {
					task_id: idOf(planLeft),
					project_id: "e2e",
				}),
				"tasks_move with a document link",
			);
			const linked = ok(
				await client.callTool("plans_documents_list", {
					plan_id: plan.id,
				}),
				"plans_documents_list after the move",
			);
			assert.ok(
				items(linked, "plans_documents_list").some(
					(item) => item.id === foreign.id,
				),
			);
			ok(
				await client.callTool("plans_documents_unlink", {
					plan_id: plan.id,
					document_id: foreign.id,
				}),
				"plans_documents_unlink across projects",
			);
		},
	);
	await check("documents_delete, deleted_list and restore", async () => {
		ok(
			await client.callTool("documents_delete", {
				document_id: document.id,
			}),
			"documents_delete",
		);
		const deleted = ok(
			await client.callTool("documents_deleted_list", {}),
			"documents_deleted_list",
		);
		assert.ok(
			items(deleted, "documents_deleted_list").some(
				(item) => item.id === document.id,
			),
		);
		ok(
			await client.callTool("documents_restore", {
				document_id: document.id,
			}),
			"documents_restore",
		);
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
		"resources/list exposes both indexes and both items",
		async () => {
			const resources = await client.listResources();
			const uris = resources.map((item) => item.uri);
			assert.ok(uris.includes("xboct-log://attachments"));
			assert.ok(uris.includes(`xboct-log://attachment/${attachment.id}`));
			assert.ok(uris.includes("xboct-log://documents"));
			assert.ok(uris.includes(`xboct-log://document/${document.key}`));
		},
	);
	await check(
		"resources/templates/list exposes the document template",
		async () => {
			const templates = await client.listResourceTemplates();
			assert.ok(
				templates.some(
					(item) => item.uriTemplate === "xboct-log://document/{key_or_id}",
				),
			);
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
	await check("resources/read returns the document index", async () => {
		const contents = await client.readResource("xboct-log://documents");
		const listed = JSON.parse(contents[0].text);
		assert.ok(Array.isArray(listed));
		const entry = listed.find((item) => item.id === document.id);
		assert.equal(entry.key, document.key);
		assert.equal(entry.uri, `xboct-log://document/${document.key}`);
	});
	await check(
		"resources/read returns document text by key and id",
		async () => {
			const byKey = await client.readResource(
				`xboct-log://document/${document.key}`,
			);
			assert.equal(byKey[0].text, document.body);
			const byId = await client.readResource(
				`xboct-log://document/${document.id}`,
			);
			assert.equal(byId[0].text, document.body);
		},
	);

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
