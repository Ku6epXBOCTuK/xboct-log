import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOp } from "#lib/remote/define.ts";
import { getOps } from "#lib/remote/index.ts";
import { closeDb } from "#lib/server/db.ts";
import type { DatabaseSync } from "node:sqlite";
import {
	fixtureDir,
	freshDatabase,
	openRuntimeDatabase,
	runtimeDir,
} from "./lib/runtime.ts";
import { readDatabase } from "./lib/snapshot.ts";

const PNG_1PX =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface Task {
	id: string;
}

interface Attachment {
	item: { id: string };
}

interface Comment {
	id: string;
}

interface Scope {
	id: number;
}

let db: DatabaseSync;

async function call(name: string, input: unknown): Promise<unknown> {
	const op = getOps().get(name);
	if (op === undefined) {
		throw new Error(`unknown operation ${name}`);
	}
	return runOp(op, input);
}

async function task(name: string, input: unknown): Promise<Task> {
	return (await call(name, input)) as Task;
}

beforeAll(async () => {
	db = await freshDatabase();
});

afterAll(() => {
	closeDb();
});

describe("deterministic seed", () => {
	it("fills the database through the operations and captures it", async () => {
		await call("projects_create", {
			project_id: "spa",
			name: "SPA",
			prefix: "SPA",
			repo: "github.com/xboct/spa",
		});
		await call("projects_create", {
			project_id: "log",
			name: "XBOCT-log",
			prefix: "LOG",
		});
		await call("projects_create", {
			project_id: "old",
			name: "Old projects",
			prefix: "OLD",
		});
		await call("projects_update", {
			project_id: "old",
			patch: { name: "Retired projects", archived: true },
		});

		const backend = (await call("scopes_create", {
			project_id: "spa",
			name: "backend",
		})) as Scope;
		const frontend = (await call("scopes_create", {
			project_id: "spa",
			name: "frontend",
		})) as Scope;
		const release = (await call("scopes_create", {
			project_id: "log",
			name: "release",
		})) as Scope;
		const scratch = (await call("scopes_create", {
			project_id: "spa",
			name: "scratch",
		})) as Scope;
		await call("scopes_update", {
			scope_id: frontend.id,
			patch: { name: "web" },
		});
		await call("scopes_delete", { scope_id: scratch.id, dry_run: true });
		await call("scopes_delete", { scope_id: scratch.id });
		expect(release.id).toBeGreaterThan(0);

		for (const name of ["bug", "design", "docs", "legacy"]) {
			await call("tags_create", { name });
		}
		await call("tags_create", { name: "release" });
		await call("tags_rename", { name: "design", new_name: "design-ui" });
		await call("tags_update", { name: "legacy", patch: { archived: true } });

		const workspace = await task("tasks_create", {
			project_id: "log",
			title: "Prepare rust workspace",
			status: "open",
			scope: "release",
			tags: ["release"],
			estimate: "L",
		});
		const toolchain = await task("tasks_create", {
			project_id: "log",
			title: "Upgrade toolchain",
			status: "in-progress",
			scope: "release",
		});
		const experiment = await task("tasks_create", {
			project_id: "log",
			title: "Cancelled experiment",
			status: "open",
		});
		const toolEpic = await task("tasks_create", {
			project_id: "log",
			title: "Toolchain epic",
			status: "open",
			is_epic: true,
			priority: "high",
		});
		const pinned = await task("tasks_create", {
			project_id: "log",
			title: "Pin sqlite",
			status: "backlog",
			epic_id: toolEpic.id,
			estimate: "S",
		});
		await call("tasks_close", { task_id: pinned.id, reason: "fixed" });
		await call("tasks_update", {
			task_id: pinned.id,
			patch: { status: "open" },
		});
		await call("tasks_close", {
			task_id: experiment.id,
			reason: "wontfix",
		});
		expect(toolchain.id).toBe("LOG-2");

		const rust = await task("tasks_create", {
			project_id: "spa",
			title: "Rust backend",
			description:
				"Port the node backend to Rust.\n\n- sqlx\n- the same database file",
			status: "open",
			priority: "high",
			is_epic: true,
			scope: "backend",
			tags: ["design-ui"],
			estimate: "L",
		});
		const list = await task("tasks_create", {
			project_id: "spa",
			title: "Port tasks list",
			description: "First pass.\n\n```txt\n55 ops\n```",
			status: "backlog",
			epic_id: rust.id,
			scope: "backend",
			tags: ["bug"],
			estimate: "M",
			assignee: "ivan",
			due_at: "2026-12-01",
			source_file: "docs/rust-rewrite.md",
		});
		const create = await task("tasks_create", {
			project_id: "spa",
			title: "Port task create",
			status: "open",
			epic_id: rust.id,
			scope: "backend",
			priority: "critical",
			estimate: "S",
		});
		const events = await task("tasks_create", {
			project_id: "spa",
			title: "Wire SSE events",
			status: "in-progress",
			epic_id: rust.id,
			scope: "web",
			tags: ["design-ui"],
			estimate: "M",
		});
		const deploy = await task("tasks_create", {
			project_id: "spa",
			title: "Document deploy",
			status: "backlog",
			tags: ["docs"],
			due_at: "2026-12-15",
		});
		const blocked = await task("tasks_create", {
			project_id: "spa",
			title: "Blocked on upstream",
			status: "blocked",
			blocked_reason: "waiting for sqlite 3.50",
			priority: "low",
		});
		const spike = await task("tasks_create", {
			project_id: "spa",
			title: "Old spike",
			status: "backlog",
		});
		const duplicate = await task("tasks_create", {
			project_id: "spa",
			title: "Duplicate report",
			status: "backlog",
			scope: "backend",
			tags: ["bug"],
		});
		const moved = await task("tasks_create", {
			project_id: "spa",
			title: "Moved from spa",
			status: "backlog",
		});

		await call("tasks_update", {
			task_id: list.id,
			patch: {
				description: "Second pass.\n\n```txt\n55 ops, 53 tools\n```",
				status: "in-progress",
			},
		});
		await call("tasks_update", {
			task_id: events.id,
			patch: { assignee: "olga" },
		});
		await call("tasks_add_blocker", {
			task_id: blocked.id,
			blocked_by: toolchain.id,
		});
		await call("tasks_add_link", {
			task_id: duplicate.id,
			link_type: "duplicates",
			target: list.id,
		});
		await call("tasks_add_link", {
			task_id: duplicate.id,
			link_type: "relates_to",
			target: create.id,
		});
		await call("tasks_delete", { task_id: spike.id });
		await call("tasks_move", { task_id: moved.id, project_id: "log" });

		const first = (await call("tasks_comments_add", {
			task_id: list.id,
			body: "Started with the list op.",
		})) as Comment;
		const second = (await call("tasks_comments_add", {
			task_id: list.id,
			body: "Second note.",
		})) as Comment;
		await call("tasks_comments_edit", {
			comment_id: first.id,
			body: "Started with tasks_list.",
		});
		await call("tasks_comments_delete", { comment_id: second.id });

		await call("attachments_add", {
			task_id: list.id,
			filename: "note.txt",
			content_base64: Buffer.from("rust port notes\n", "utf8").toString(
				"base64",
			),
		});
		await call("attachments_add", {
			task_id: create.id,
			filename: "pixel.png",
			content_base64: PNG_1PX,
		});
		const spec = (await call("attachments_add", {
			task_id: list.id,
			filename: "spec.md",
			content_base64: Buffer.from("# Spec\n", "utf8").toString("base64"),
		})) as Attachment;
		await call("attachments_delete", { attachment_id: spec.item.id });
		const restored = (await call("attachments_add", {
			task_id: events.id,
			filename: "restored.txt",
			content_base64: Buffer.from("restored\n", "utf8").toString("base64"),
		})) as Attachment;
		await call("attachments_delete", { attachment_id: restored.item.id });
		await call("attachments_restore", { attachment_id: restored.item.id });
		const moving = (await call("attachments_add", {
			task_id: create.id,
			filename: "moving.txt",
			content_base64: Buffer.from("moving\n", "utf8").toString("base64"),
		})) as Attachment;
		await call("attachments_move", {
			attachment_id: moving.item.id,
			task_id: events.id,
		});
		const source = (await call("attachments_add", {
			task_id: list.id,
			filename: "copy-source.txt",
			content_base64: Buffer.from("copy\n", "utf8").toString("base64"),
		})) as Attachment;
		await call("attachments_copy", {
			attachment_id: source.item.id,
			task_id: deploy.id,
		});
		const purged = (await call("attachments_add", {
			task_id: create.id,
			filename: "purged.txt",
			content_base64: Buffer.from("purged\n", "utf8").toString("base64"),
		})) as Attachment;
		await call("attachments_delete", { attachment_id: purged.item.id });
		await call("attachments_purge", { attachment_id: purged.item.id });

		expect(backend.id).toBeGreaterThan(0);
		expect(workspace.id).toBe("LOG-1");

		db = openRuntimeDatabase();
		const document = readDatabase(db, { runtimeDir, now: Date.now() });
		expect(document.rows.tasks).toHaveLength(14);
		expect(document.rows.projects).toHaveLength(3);
		expect(document.rows.task_attachments?.length).toBeGreaterThan(0);

		const target = join(fixtureDir(), "db.json");
		mkdirSync(fixtureDir(), { recursive: true });
		writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
		console.log(`wrote ${target}`);
	});
});
