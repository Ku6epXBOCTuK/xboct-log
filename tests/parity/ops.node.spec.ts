import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { getOps } from "#lib/remote/index.ts";
import { runOp } from "#lib/remote/define.ts";
import { getDb } from "#lib/server/db.ts";
import { GET as eventsGET } from "../../src/routes/api/events/+server.ts";
import { GET as deletedMediaGET } from "../../src/routes/deleted/media/[id]/+server.ts";
import { GET as mediaGET } from "../../src/routes/media/[id]/+server.ts";
import { POST as mcpPOST } from "../../src/routes/mcp/+server.ts";
import { createNormalizer } from "./lib/normalize.ts";
import {
	databasePath,
	fixtureDir,
	openRuntimeDatabase,
	runtimeDir,
} from "./lib/runtime.ts";
import { databaseIdentities } from "./lib/snapshot.ts";

interface Call {
	name: string;
	kind: string;
	mcp: boolean;
	input: unknown;
	output: unknown;
}

const runtime = runtimeDir;
const calls: Call[] = [];
const covered = new Set<string>();

let db = openRuntimeDatabase();
const normalize = createNormalizer({
	identities: databaseIdentities(db),
	runtimeDir: runtime,
	now: Date.now(),
});

beforeAll(() => {
	expect(
		existsSync(databasePath()),
		"the parity database is missing, run pnpm parity:seed first",
	).toBe(true);
});

afterAll(() => {
	const missing = [...getOps().keys()].filter(
		(name) => !covered.has(name.split("#")[0]),
	);
	expect(missing).toEqual([]);
});

async function call(name: string, input: unknown = {}): Promise<unknown> {
	const base = name.split("#")[0];
	const op = getOps().get(base);
	if (op === undefined) {
		throw new Error(`unknown operation ${base}`);
	}
	const normalizedInput = normalize(input);
	let output: unknown;
	try {
		output = await runOp(op, input);
	} catch (error) {
		throw new Error(`${name} failed`, { cause: error });
	}
	calls.push({
		name,
		kind: op.kind,
		mcp: op.mcp ?? true,
		input: normalizedInput,
		output: normalize(output),
	});
	if (name === base) {
		covered.add(base);
	}
	return output;
}

function id(value: unknown): string {
	return String((value as { id: string }).id);
}

function base64(value: string): string {
	return Buffer.from(value).toString("base64");
}

it("captures every operation against the seeded database", async () => {
	db = getDb();
	await call("projects_list");
	await call("projects_get", { project_id: "spa" });
	await call("projects_create", {
		project_id: "sweep",
		name: "Sweep",
		prefix: "SWP",
	});
	await call("projects_create", {
		project_id: "sweep-target",
		name: "Sweep target",
		prefix: "SWT",
	});
	await call("projects_update", {
		project_id: "sweep",
		patch: { repo: "github.com/xboct/sweep" },
	});

	await call("scopes_list");
	await call("scopes_project_ids");
	const scope = await call("scopes_create", {
		project_id: "sweep",
		name: "Base scope",
	});
	const disposable = await call("scopes_create", {
		project_id: "sweep",
		name: "Disposable",
	});
	await call("scopes_get", { scope_id: (scope as { id: number }).id });
	await call("scopes_update", {
		scope_id: (disposable as { id: number }).id,
		patch: { name: "Renamed scope" },
	});
	await call("scopes_delete", {
		scope_id: (disposable as { id: number }).id,
		dry_run: true,
	});
	await call("scopes_delete", {
		scope_id: (disposable as { id: number }).id,
	});

	await call("tags_list");
	await call("tags_dictionary");
	await call("tags_inventory");
	await call("tags_create", { name: "sweep-tag" });
	await call("tags_create", { name: "sweep-rename" });
	await call("tags_update", {
		name: "sweep-tag",
		patch: { archived: true },
	});
	await call("tags_rename", {
		name: "sweep-rename",
		new_name: "sweep-renamed",
	});

	const base = await call("tasks_create", {
		project_id: "sweep",
		title: "Base",
		status: "open",
		priority: "high",
		tags: ["bug"],
		estimate: "M",
	});
	const baseId = id(base);
	const epic = await call("tasks_create", {
		project_id: "sweep",
		title: "Sweep epic",
		is_epic: true,
		scope_id: (scope as { id: number }).id,
	});
	const epicId = id(epic);
	await call("tasks_get", { task_id: baseId });
	await call("tasks_get_many", { task_ids: [baseId, epicId] });
	await call("tasks_list");
	await call("tasks_list#filter", {
		status: ["open", "in-progress", "blocked"],
		sort: "title",
		limit: 5,
		include_project: true,
		include_scope: true,
	});
	await call("tasks_list#search", {
		q_any: ["rust", "deploy", "sweep"],
		limit: 10,
	});
	await call("tasks_options", { project_id: "sweep" });
	await call("tasks_stats");
	await call("tasks_create_many", {
		items: [
			{ project_id: "sweep", title: "Many one" },
			{ project_id: "sweep", title: "Many two", status: "open" },
		],
	});
	const second = await call("tasks_create", {
		project_id: "sweep",
		title: "Patch me",
	});
	const secondId = id(second);
	await call("tasks_update", {
		task_id: epicId,
		patch: {
			priority: "low",
			due_at: "2027-01-15",
			assignee: "ivan",
			description: "Epic of the parity sweep.",
		},
	});
	await call("tasks_update_many", {
		items: [
			{ task_id: secondId, patch: { priority: "low" } },
			{ task_id: "SPA-999", patch: { priority: "high" } },
		],
	});
	const doomed = await call("tasks_create", {
		project_id: "sweep",
		title: "Doomed",
	});
	await call("tasks_close", { task_id: id(doomed), reason: "fixed" });
	const closeA = await call("tasks_create", {
		project_id: "sweep",
		title: "Close many A",
	});
	const closeB = await call("tasks_create", {
		project_id: "sweep",
		title: "Close many B",
	});
	await call("tasks_close_many", {
		items: [
			{ task_id: id(closeA), reason: "wontfix" },
			{ task_id: id(closeB), reason: "fixed" },
			{ task_id: "SWP-9999", reason: "fixed" },
		],
	});
	await call("tasks_delete", { task_id: secondId });
	await call("tasks_restore", { task_id: secondId });
	await call("tasks_move", {
		task_id: secondId,
		project_id: "sweep-target",
	});
	await call("tasks_history", { task_id: baseId, limit: 20 });
	await call("tasks_revisions_list", { task_id: baseId });
	await call("tasks_deleted_list");

	const blocked = await call("tasks_create", {
		project_id: "sweep",
		title: "Blocked",
	});
	await call("tasks_add_blocker", {
		task_id: id(blocked),
		blocked_by: baseId,
	});
	await call("tasks_remove_blocker", {
		task_id: id(blocked),
		blocked_by: baseId,
	});

	const linked = await call("tasks_create", {
		project_id: "sweep",
		title: "Linked",
	});
	const linkedId = id(linked);
	await call("tasks_add_link", {
		task_id: linkedId,
		link_type: "duplicates",
		target: baseId,
	});
	await call("tasks_remove_link", {
		task_id: linkedId,
		link_type: "duplicates",
		target: baseId,
	});

	const comment = await call("tasks_comments_add", {
		task_id: baseId,
		body: "Parity comment",
	});
	await call("tasks_comments_edit", {
		comment_id: (comment as { id: string }).id,
		body: "Parity comment edited",
	});
	await call("tasks_comments_list", { task_id: baseId });
	await call("tasks_comments_delete", {
		comment_id: (comment as { id: string }).id,
	});

	const live = await call("attachments_add", {
		task_id: baseId,
		filename: "parity.txt",
		content_base64: base64("parity"),
	});
	const liveAttachment = (live as { item: { id: string } }).item.id;
	await call("attachments_list", { task_id: baseId });
	await call("attachments_delete", { attachment_id: liveAttachment });
	await call("attachments_deleted_list", { task_id: baseId });
	await call("attachments_deleted_list#all");
	await call("attachments_restore", { attachment_id: liveAttachment });
	await call("attachments_copy", {
		attachment_id: liveAttachment,
		task_id: linkedId,
	});
	const moving = await call("attachments_add", {
		task_id: baseId,
		filename: "moving.txt",
		content_base64: base64("moving"),
	});
	await call("attachments_move", {
		attachment_id: (moving as { item: { id: string } }).item.id,
		task_id: epicId,
	});
	const purged = await call("attachments_add", {
		task_id: baseId,
		filename: "purged.txt",
		content_base64: base64("bye"),
	});
	await call("attachments_delete", {
		attachment_id: (purged as { item: { id: string } }).item.id,
	});
	await call("attachments_purge", {
		attachment_id: (purged as { item: { id: string } }).item.id,
	});
	await call("attachments_verify");

	await call("activity_list", { limit: 10 });

	const events = await captureEvents(async () => {
		await call("tasks_update#sse", {
			task_id: linkedId,
			patch: { title: "Linked task changed" },
		});
	});

	const backup = await call("backup_create");
	const backupName = basename((backup as { path: string }).path);
	await call("backup_list");
	await call("backups_inspect", { kind: "manual", name: backupName });
	await call("backups_restore", { kind: "manual", name: backupName });
	await call("tasks_get#after-restore", { task_id: baseId });

	const attachments = getDb()
		.prepare("SELECT id, deleted_at FROM task_attachments ORDER BY rowid")
		.all() as unknown as { id: string; deleted_at: string | null }[];
	const liveRow = attachments.find((row) => row.deleted_at === null);
	const deletedRow = attachments.find((row) => row.deleted_at !== null);
	expect(liveRow).toBeDefined();
	expect(deletedRow).toBeDefined();

	const media = {
		live: await readMedia(mediaGET, liveRow?.id ?? ""),
		deleted: await readMedia(deletedMediaGET, deletedRow?.id ?? ""),
		missing: await readMedia(mediaGET, "00000000-0000-0000-0000-000000000001"),
	};

	const errors = await captureErrors([
		{ name: "tasks_get", arguments: { task_id: "SPA-999" } },
		{
			name: "tasks_create",
			arguments: { project_id: "ghost", title: "Nowhere" },
		},
		{
			name: "projects_create",
			arguments: { project_id: "spa", name: "SPA again", prefix: "SPA" },
		},
		{ name: "tasks_list", arguments: { titel: "x" } },
		{
			name: "tasks_comments_edit",
			arguments: {
				comment_id: "00000000-0000-0000-0000-000000000002",
				body: "Nowhere",
			},
		},
		{ name: "scopes_delete", arguments: { scope_id: 999999 } },
		{
			name: "attachments_purge",
			arguments: {
				attachment_id: "11111111-1111-4111-8111-111111111111",
			},
		},
		{
			name: "tasks_add_link",
			arguments: {
				task_id: baseId,
				link_type: "relates_to",
				target: baseId,
			},
		},
	]);

	writeFileSync(
		join(fixtureDir(), "ops.json"),
		`${JSON.stringify({ calls, errors, events, media }, null, 2)}\n`,
	);
});

const HEADERS = [
	"content-type",
	"content-disposition",
	"content-length",
	"cache-control",
	"x-content-type-options",
];

function pickHeaders(headers: Headers): Record<string, string> {
	return Object.fromEntries(
		HEADERS.filter((name) => headers.has(name)).map((name) => [
			name,
			headers.get(name) ?? "",
		]),
	);
}

async function readMedia(
	handler: (event: never) => Response | Promise<Response>,
	attachment: string,
): Promise<unknown> {
	const response = await handler({ params: { id: attachment } } as never);
	const bytes = new Uint8Array(await response.arrayBuffer());
	return {
		status: response.status,
		headers: pickHeaders(response.headers),
		sha256: createHash("sha256").update(bytes).digest("hex"),
		size: bytes.byteLength,
	};
}

async function captureEvents(trigger: () => Promise<void>): Promise<unknown> {
	const controller = new AbortController();
	const response = eventsGET({
		request: new Request("http://localhost/api/events", {
			signal: controller.signal,
		}),
	} as never);
	const reader = response.body?.getReader();
	if (reader === undefined) {
		throw new Error("the events endpoint returned no body");
	}
	const decoder = new TextDecoder();
	let buffer = "";

	async function frame(): Promise<string> {
		for (;;) {
			const boundary = buffer.indexOf("\n\n");
			if (boundary >= 0) {
				const next = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				return next;
			}
			const chunk = await reader.read();
			if (chunk.done) {
				return buffer;
			}
			buffer += decoder.decode(chunk.value, { stream: true });
		}
	}

	const sync = await frame();
	await trigger();
	const change = await frame();
	controller.abort();
	await reader.cancel().catch(() => undefined);
	return {
		status: response.status,
		headers: pickHeaders(response.headers),
		sync: normalize(sync),
		change: normalize(change),
	};
}

async function captureErrors(
	cases: { name: string; arguments: unknown }[],
): Promise<unknown[]> {
	const captured: unknown[] = [];
	for (const item of cases) {
		const response = await mcpPOST({
			request: new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: item,
				}),
			}),
		} as never);
		const text = await response.text();
		const payload = text
			.split("\n")
			.find((line) => line.startsWith("data: "))
			?.slice("data: ".length);
		const result = (
			JSON.parse(payload ?? text) as {
				result?: {
					isError?: boolean;
					content?: { text?: string }[];
					structuredContent?: unknown;
				};
			}
		).result;
		expect(result?.isError, `${item.name} did not fail`).toBe(true);
		captured.push(
			normalize({
				name: item.name,
				arguments: item.arguments,
				isError: true,
				text: result?.content?.[0]?.text,
				structuredContent: result?.structuredContent,
			}),
		);
	}
	return captured;
}
