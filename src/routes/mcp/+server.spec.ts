import type { RequestEvent } from "@sveltejs/kit";
import {
	CLIENT_CAPABILITIES_META_KEY,
	CLIENT_INFO_META_KEY,
	PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { taskSchema } from "#lib/entities.ts";
import { getOps } from "#lib/remote/index.ts";
import { searchActivity } from "#lib/server/activity.ts";
import { resetAutoBackupState } from "#lib/server/auto-backup.ts";
import { backupConfig } from "#lib/server/backup.ts";
import { closeDb, getDb } from "#lib/server/db.ts";
import { migrateDatabase } from "#lib/server/migrations.ts";
import { createProject } from "#lib/server/projects.ts";
import { createTask, deleteTask } from "#lib/server/tasks/index.ts";
import { STATUSES } from "#lib/types.ts";
import { GET, POST } from "./+server.js";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-mcp-"));
	process.env.XBOCT_LOG_MEDIA_DIR = join(dbDir, "media");
	const db = getDb(join(dbDir, "mcp.db"));
	await migrateDatabase(db);
});

afterAll(() => {
	closeDb();
	rmSync(dbDir, { recursive: true, force: true });
});

function request(
	method: string,
	body: unknown,
	extra: Record<string, string> = {},
): Request {
	return new Request("http://localhost/mcp", {
		method,
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			...extra,
		},
		body: JSON.stringify(body),
	});
}

async function rpc(
	method: string,
	params: unknown,
	headers: Record<string, string> = {},
): Promise<{
	result?: {
		tools?: {
			name: string;
			outputSchema?: {
				required?: string[];
				properties?: Record<string, unknown>;
			};
		}[];
		serverInfo?: { name: string };
		structuredContent?: unknown;
		isError?: boolean;
		content?: { type: string; text: string }[];
	};
	error?: unknown;
}> {
	const response = await POST({
		request: request(
			"POST",
			{
				jsonrpc: "2.0",
				id: 1,
				method,
				params,
			},
			headers,
		),
	} as unknown as RequestEvent);
	expect(response.status).toBe(200);
	const text = await response.text();
	const data =
		text
			.split("\n")
			.find((line) => line.startsWith("data: "))
			?.slice("data: ".length) ?? text;
	expect(data).not.toBe("");
	return JSON.parse(data);
}

describe("/mcp endpoint", () => {
	it("answers initialize with server info", async () => {
		const body = await rpc("initialize", {
			protocolVersion: "2026-07-28",
			capabilities: {},
			clientInfo: { name: "vitest", version: "0.0.0" },
		});
		expect(body.error).toBeUndefined();
		expect(body.result?.serverInfo?.name).toBe("xboct-log");
	});

	it("lists exactly the tools from the registry", async () => {
		const body = await rpc("tools/list", {});
		expect(body.error).toBeUndefined();
		expect(body.result?.tools?.map((tool) => tool.name).sort()).toEqual(
			[...getOps().keys()].sort(),
		);
		for (const tool of body.result?.tools ?? []) {
			expect(
				tool.outputSchema,
				`${tool.name} has no outputSchema`,
			).toBeDefined();
		}
	});

	it("publishes the output schema and answers a flat create payload", async () => {
		const list = await rpc("tools/list", {});
		const tool = list.result?.tools?.find(
			(item) => item.name === "tasks_create",
		);
		expect(tool?.outputSchema?.required).toEqual(
			expect.arrayContaining(["id", "title", "status", "warnings"]),
		);

		const project = createProject(getDb(), {
			id: "out",
			name: "Output",
			prefix: "OUT",
		});
		expect(project.isOk()).toBe(true);

		const body = await rpc("tools/call", {
			name: "tasks_create",
			arguments: { project_id: "out", title: "Created" },
		});
		expect(body.error).toBeUndefined();
		const result = body.result as {
			isError?: boolean;
			structuredContent?: {
				id?: string;
				status?: string;
				warnings?: unknown;
			};
		};
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent?.id).toMatch(/^OUT-\d+$/);
		expect(STATUSES).toContain(result.structuredContent?.status);
		expect(Array.isArray(result.structuredContent?.warnings)).toBe(true);
	});

	it("records the client name from the request envelope", async () => {
		const project = createProject(getDb(), {
			id: "clt",
			name: "Client",
			prefix: "CLT",
		});
		expect(project.isOk()).toBe(true);

		const body = await rpc(
			"tools/call",
			{
				name: "tasks_create",
				arguments: { project_id: "clt", title: "From a client" },
				_meta: {
					[PROTOCOL_VERSION_META_KEY]: "2026-07-28",
					[CLIENT_CAPABILITIES_META_KEY]: {},
					[CLIENT_INFO_META_KEY]: { name: "vitest", version: "0.0.0" },
				},
			},
			{
				"mcp-protocol-version": "2026-07-28",
				"mcp-method": "tools/call",
				"mcp-name": "tasks_create",
			},
		);
		expect(body.error).toBeUndefined();
		const created = body.result?.structuredContent as { id?: string };
		expect(created.id).toMatch(/^CLT-\d+$/);

		const log = searchActivity(getDb(), { op: "tasks_create", limit: 1 });
		expect(log.items[0]).toMatchObject({
			source: "mcp",
			client: "vitest/0.0.0",
		});
	});

	it("answers GET without crashing", async () => {
		const response = await GET({
			request: request("GET", undefined),
		} as unknown as RequestEvent);
		expect([200, 400, 405]).toContain(response.status);
	});

	it("accepts status as a string", async () => {
		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: { status: "open" },
		});
		expect(body.error).toBeUndefined();
		const structured = body.result?.structuredContent as {
			items?: unknown;
			total?: unknown;
		};
		expect(Array.isArray(structured.items)).toBe(true);
		expect(typeof structured.total).toBe("number");
	});

	it("returns structuredContent on tool call", async () => {
		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: {},
		});
		expect(body.error).toBeUndefined();
		expect(body.result?.structuredContent).toBeDefined();
		const structured = body.result?.structuredContent as {
			items?: unknown;
		};
		expect(Array.isArray(structured.items)).toBe(true);
	});

	it("returns structuredContent when fields trims the task", async () => {
		const project = createProject(getDb(), {
			id: "fld",
			name: "Fields",
			prefix: "FLD",
		});
		expect(project.isOk()).toBe(true);
		const task = createTask(getDb(), { project_id: "fld", title: "Trimmed" });
		expect(task.isOk()).toBe(true);

		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: { project_id: "fld", fields: "id,project_id,title,status" },
		});
		expect(body.error).toBeUndefined();
		const result = body.result as {
			isError?: boolean;
			structuredContent?: { items?: Record<string, unknown>[] };
		};
		expect(result.isError).toBeUndefined();
		expect(
			Object.keys(result.structuredContent?.items?.[0] ?? {}).sort(),
		).toEqual(["id", "number", "project_id", "status", "title"]);
	});

	it("accepts list filters and the new sort keys", async () => {
		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: {
				project_id: ["spa", "bil"],
				scope_id: [1, 2],
				epic_id: ["LOG-5", "LOG-6"],
				exclude_project_id: "old",
				has_scope: true,
				has_epic: false,
				sort: "number",
				order: "desc",
			},
		});
		expect(body.error).toBeUndefined();
		const result = body.result as { isError?: boolean };
		expect(result.isError).toBeUndefined();
	});

	it("filters by a JSON-encoded project list sent over rpc", async () => {
		const project = createProject(getDb(), {
			id: "lst",
			name: "List",
			prefix: "LST",
		});
		expect(project.isOk()).toBe(true);
		const task = createTask(getDb(), { project_id: "lst", title: "Listed" });
		expect(task.isOk()).toBe(true);

		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: { project_id: '["lst", "spa"]' },
		});
		expect(body.error).toBeUndefined();
		const result = body.result as {
			isError?: boolean;
			structuredContent?: {
				total?: number;
				items?: { project_id?: string }[];
			};
		};
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent?.total).toBe(1);
		expect(result.structuredContent?.items?.[0]?.project_id).toBe("lst");
	});

	it("rejects an unknown parameter instead of ignoring it", async () => {
		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: { titel: "x" },
		});
		expect(body.error).toBeUndefined();
		const result = body.result as {
			isError?: boolean;
			content?: { type: string; text: string }[];
		};
		expect(result.isError).toBe(true);
		expect(result.content?.[0].text).toContain("titel");
	});

	it("returns a machine readable error in structuredContent", async () => {
		const body = await rpc("tools/call", {
			name: "tasks_create",
			arguments: { project_id: "ghost-project", title: "Nowhere" },
		});
		expect(body.error).toBeUndefined();
		const result = body.result as {
			isError?: boolean;
			structuredContent?: { error?: { kind?: string; message?: string } };
		};
		expect(result.isError).toBe(true);
		expect(result.structuredContent?.error?.kind).toBe("not_found");
		expect(result.structuredContent?.error?.message).toContain("ghost-project");
	});

	it("reports an invalid argument as an error result", async () => {
		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: { titel: "x" },
		});
		const result = body.result as {
			isError?: boolean;
			content?: { type: string; text: string }[];
		};
		expect(result.isError).toBe(true);
		expect(result.content?.[0].text).toContain("titel");
	});

	it("takes a snapshot before an MCP command", async () => {
		resetAutoBackupState();
		const autoDir = join(backupConfig().dir, "auto");
		rmSync(autoDir, { recursive: true, force: true });

		const body = await rpc("tools/call", {
			name: "tasks_create",
			arguments: { project_id: "spa", title: "Snapshot me" },
		});
		expect(body.error).toBeUndefined();

		expect(readdirSync(autoDir)).toHaveLength(1);
	});

	it("reports an empty patch instead of a silent success", async () => {
		const db = getDb();
		const project = createProject(db, {
			id: "mcp-patch",
			name: "MCP Patch",
			prefix: "MPP",
		});
		expect(project.isOk()).toBe(true);
		const task = createTask(db, {
			project_id: "mcp-patch",
			title: "Patch me",
		});
		expect(task.isOk()).toBe(true);

		const body = await rpc("tools/call", {
			name: "tasks_update_many",
			arguments: {
				items: [{ id: task._unsafeUnwrap().id, patch: {} }],
			},
		});
		const structured = body.result?.structuredContent as {
			items?: { ok: boolean; error?: { kind?: string; message?: string } }[];
			succeeded: number;
			failed: number;
		};
		expect(structured.succeeded).toBe(0);
		expect(structured.failed).toBe(1);
		expect(structured.items?.[0].ok).toBe(false);
		expect(structured.items?.[0].error?.kind).toBe("validation");
		expect(structured.items?.[0].error?.message).toContain("patch is empty");
	});

	it("restores a soft-deleted task", async () => {
		const db = getDb();
		const project = createProject(db, {
			id: "mcp-restore",
			name: "MCP Restore",
			prefix: "MPR",
		});
		expect(project.isOk()).toBe(true);
		const task = createTask(db, {
			project_id: "mcp-restore",
			title: "Restore me",
		});
		expect(task.isOk()).toBe(true);
		const taskId = task._unsafeUnwrap().id;
		expect(deleteTask(db, taskId).isOk()).toBe(true);

		const body = await rpc("tools/call", {
			name: "tasks_restore",
			arguments: { id: taskId },
		});
		expect(body.error).toBeUndefined();
		const result = body.result as { isError?: boolean };
		expect(result.isError).toBeUndefined();
		const structured = body.result?.structuredContent as {
			id?: string;
			deleted_at?: string | null;
		};
		expect(structured.id).toBe(taskId);
		expect(structured.deleted_at).toBeNull();
	});
});

describe("output contracts", () => {
	async function call(
		name: string,
		args: unknown,
	): Promise<Record<string, unknown>> {
		const body = await rpc("tools/call", { name, arguments: args });
		expect(
			body.error,
			`${name} raised ${JSON.stringify(body.error)}`,
		).toBeUndefined();
		const result = body.result as {
			isError?: boolean;
			structuredContent?: Record<string, unknown>;
			content?: { text?: string }[];
		};
		expect(
			result.isError,
			`${name}: ${result.content?.[0]?.text}`,
		).toBeUndefined();
		return result.structuredContent ?? {};
	}

	async function freshTask(): Promise<string> {
		const task = await call("tasks_create", {
			project_id: "sweep",
			title: "Sweep task",
		});
		return String(task.id);
	}

	async function freshScope(): Promise<number> {
		const scope = await call("scopes_create", {
			project_id: "sweep",
			name: "Sweep scope",
		});
		return Number(scope.id);
	}

	let counter = 0;

	it("answers every tool with a payload matching its output schema", async () => {
		const project = await call("projects_create", {
			id: "sweep",
			name: "Sweep",
			prefix: "SWP",
		});
		await call("projects_create", {
			id: "sweep-target",
			name: "Sweep target",
			prefix: "SWT",
		});
		const base = String(
			(
				await call("tasks_create", {
					project_id: "sweep",
					title: "Base",
				})
			).id,
		);
		const scope = Number(
			(
				await call("scopes_create", {
					project_id: "sweep",
					name: "Base scope",
				})
			).id,
		);
		expect(project.id).toBe("sweep");

		const fixtures: Record<string, () => unknown | Promise<unknown>> = {
			tasks_history: () => ({ id: base }),
			activity_list: () => ({}),
			attachments_list: () => ({ id: base }),
			attachments_add: () => ({
				id: base,
				filename: "sweep.txt",
				content_base64: Buffer.from("hello").toString("base64"),
			}),
			attachments_delete: async () => {
				const added = await call("attachments_add", {
					id: base,
					filename: "gone.txt",
					content_base64: Buffer.from("bye").toString("base64"),
				});
				return { id: (added.item as { id: string }).id };
			},
			attachments_verify: () => ({}),
			backup_create: () => ({}),
			backup_list: () => ({}),
			tasks_add_blocker: async () => ({
				id: await freshTask(),
				blocked_by: base,
			}),
			tasks_remove_blocker: async () => {
				const blocked = await freshTask();
				await call("tasks_add_blocker", { id: blocked, blocked_by: base });
				return { id: blocked, blocked_by: base };
			},
			tasks_comments_list: () => ({ task_id: base }),
			tasks_comments_add: () => ({ task_id: base, body: "Sweep comment" }),
			tasks_comments_edit: async () => {
				const comment = await call("tasks_comments_add", {
					task_id: base,
					body: "Original",
				});
				return { id: comment.id, body: "Edited" };
			},
			tasks_comments_delete: async () => {
				const comment = await call("tasks_comments_add", {
					task_id: base,
					body: "Doomed",
				});
				return { id: comment.id };
			},
			tasks_add_link: async () => ({
				id: await freshTask(),
				link_type: "relates_to",
				target: base,
			}),
			tasks_remove_link: async () => {
				const linked = await freshTask();
				await call("tasks_add_link", {
					id: linked,
					link_type: "relates_to",
					target: base,
				});
				return { id: linked, link_type: "relates_to", target: base };
			},
			projects_list: () => ({}),
			projects_get: () => ({ id: "sweep" }),
			projects_create: () => {
				counter += 1;
				return {
					id: `sweep-${counter}`,
					name: `Sweep ${counter}`,
					prefix: `SW${counter}`,
				};
			},
			projects_update: () => ({ id: "sweep", patch: { name: "Sweep" } }),
			tasks_revisions_list: () => ({ id: base }),
			scopes_list: () => ({}),
			scopes_get: () => ({ id: scope }),
			scopes_project_ids: () => ({}),
			scopes_create: () => ({ project_id: "sweep", name: "Fresh scope" }),
			scopes_update: async () => ({
				id: await freshScope(),
				patch: { name: "Renamed scope" },
			}),
			scopes_delete: async () => ({
				id: await freshScope(),
				dry_run: true,
			}),
			tags_list: () => ({}),
			tags_create: () => ({ name: "sweep-tag" }),
			tags_update: () => ({ name: "sweep-tag", patch: { archived: true } }),
			tags_rename: async () => {
				await call("tags_create", { name: "sweep-rename" });
				return { name: "sweep-rename", new_name: "sweep-renamed" };
			},
			tasks_list: () => ({}),
			tasks_deleted_list: () => ({}),
			tasks_get_many: () => ({ ids: [base] }),
			tasks_get: () => ({ id: base }),
			tasks_create: () => ({ project_id: "sweep", title: "Created" }),
			tasks_create_many: () => ({
				items: [
					{ project_id: "sweep", title: "Many one" },
					{ project_id: "sweep", title: "Many two" },
				],
			}),
			tasks_update: async () => ({
				id: await freshTask(),
				patch: { priority: "high" },
			}),
			tasks_update_many: async () => ({
				items: [{ id: await freshTask(), patch: { priority: "low" } }],
			}),
			tasks_close: async () => ({
				id: await freshTask(),
				reason: "fixed",
			}),
			tasks_close_many: async () => ({
				items: [{ id: await freshTask(), reason: "wontfix" }],
			}),
			tasks_delete: async () => ({ id: await freshTask() }),
			tasks_restore: async () => {
				const doomed = await freshTask();
				await call("tasks_delete", { id: doomed });
				return { id: doomed };
			},
			tasks_move: async () => ({
				id: await freshTask(),
				project_id: "sweep-target",
			}),
		};

		expect(Object.keys(fixtures).sort()).toEqual([...getOps().keys()].sort());

		for (const [name, op] of getOps()) {
			const structured = await call(name, await fixtures[name]());
			const parsed = op.output!.safeParse(structured);
			expect(
				parsed.success,
				`${name}: ${parsed.success ? "" : parsed.error.message}`,
			).toBe(true);
			if (name === "tasks_get") {
				const unknown = Object.keys(structured).filter(
					(key) => !(key in taskSchema.shape),
				);
				expect(
					unknown,
					`tasks_get returns fields missing from taskSchema`,
				).toEqual([]);
			}
		}
	});
});
