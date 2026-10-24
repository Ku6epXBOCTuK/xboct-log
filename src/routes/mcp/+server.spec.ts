import type { RequestEvent } from "@sveltejs/kit";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOps } from "#lib/remote/index.ts";
import { resetAutoBackupState } from "#lib/server/auto-backup.ts";
import { backupConfig } from "#lib/server/backup.ts";
import { closeDb, getDb } from "#lib/server/db.ts";
import { migrateDatabase } from "#lib/server/migrations.ts";
import { createProject } from "#lib/server/projects.ts";
import { createTask, deleteTask } from "#lib/server/tasks/index.ts";
import { GET, POST } from "./+server.js";

let dbDir: string;

beforeAll(async () => {
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-mcp-"));
	const db = getDb(join(dbDir, "mcp.db"));
	await migrateDatabase(db);
});

afterAll(() => {
	closeDb();
	rmSync(dbDir, { recursive: true, force: true });
});

function request(method: string, body: unknown): Request {
	return new Request("http://localhost/mcp", {
		method,
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
		},
		body: JSON.stringify(body),
	});
}

async function rpc(
	method: string,
	params: unknown,
): Promise<{
	result?: {
		tools?: { name: string }[];
		serverInfo?: { name: string };
		structuredContent?: unknown;
		isError?: boolean;
		content?: { type: string; text: string }[];
	};
	error?: unknown;
}> {
	const response = await POST({
		request: request("POST", {
			jsonrpc: "2.0",
			id: 1,
			method,
			params,
		}),
	} as unknown as RequestEvent);
	expect(response.status).toBe(200);
	const text = await response.text();
	const data = text
		.split("\n")
		.find((line) => line.startsWith("data: "))
		?.slice("data: ".length);
	expect(data).toBeDefined();
	return JSON.parse(data ?? "{}");
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
