import type { APIRequestContext, Page } from "@playwright/test";

export interface Fixture {
	project: string;
	prefix: string;
	scope: string;
	tag: string;
	suffix: string;
	newProjectName: string;
	newProjectPrefix: string;
	created: Record<string, string>;
	rpc(
		request: APIRequestContext,
		method: string,
		params: unknown,
	): Promise<unknown>;
	notify(request: APIRequestContext, method: string): Promise<void>;
	callTool<T = Record<string, string>>(
		request: APIRequestContext,
		name: string,
		args: unknown,
	): Promise<T>;
	taskIds(page: Page): Promise<string[]>;
	seed(request: APIRequestContext): Promise<void>;
}

export function createFixture(label: string): Fixture {
	const suffix = Date.now().toString(36).slice(-4);
	const project = `ui-${suffix}-${label}`;
	const prefix = `U${suffix.slice(-2).toUpperCase()}${label[0].toUpperCase()}`;
	const scope = "frontend";
	const tag = `ui-${suffix}-${label}`;
	const newProjectName = `UI Created ${suffix}`;
	const newProjectPrefix = `N${suffix.slice(0, 3).toUpperCase()}`;
	const created: Record<string, string> = {};

	let sessionId = "";
	let requestId = 0;

	async function rpc(
		request: APIRequestContext,
		method: string,
		params: unknown,
	): Promise<unknown> {
		const response = await request.post("/mcp", {
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...(sessionId === "" ? {} : { "mcp-session-id": sessionId }),
			},
			data: { jsonrpc: "2.0", id: (requestId += 1), method, params },
		});
		const sid = response.headers()["mcp-session-id"];
		if (sid) {
			sessionId = sid;
		}
		const text = await response.text();
		const line = text
			.split(/\r?\n/)
			.find((item) => item.startsWith("data: ") && item.slice(6).trim());
		const payload = line ? JSON.parse(line.slice(6)) : JSON.parse(text);
		if (payload.error) {
			throw new Error(`${method}: ${payload.error.message}`);
		}
		return payload.result;
	}

	async function notify(
		request: APIRequestContext,
		method: string,
	): Promise<void> {
		await request.post("/mcp", {
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...(sessionId === "" ? {} : { "mcp-session-id": sessionId }),
			},
			data: { jsonrpc: "2.0", method },
		});
	}

	async function callTool<T = Record<string, string>>(
		request: APIRequestContext,
		name: string,
		args: unknown,
	): Promise<T> {
		const result = (await rpc(request, "tools/call", {
			name,
			arguments: args,
		})) as {
			structuredContent?: T;
			content?: Array<{ text?: unknown }>;
		};
		if (result.structuredContent) {
			return result.structuredContent;
		}
		const content = result.content?.[0]?.text;
		if (typeof content !== "string") {
			return result as T;
		}
		try {
			return JSON.parse(content) as T;
		} catch {
			return content as T;
		}
	}

	async function taskIds(page: Page): Promise<string[]> {
		return page
			.locator("tr[data-task-id]")
			.evaluateAll((rows) =>
				rows.map((row) => row.getAttribute("data-task-id") ?? ""),
			);
	}

	async function seed(request: APIRequestContext): Promise<void> {
		await rpc(request, "initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "xboct-log-e2e", version: "1" },
		});
		await notify(request, "notifications/initialized");

		await callTool(request, "projects_create", {
			project_id: project,
			name: "UI E2E",
			prefix,
		});
		await callTool(request, "scopes_create", {
			project_id: project,
			name: scope,
		});
		await callTool(request, "tags_create", { name: tag });

		created.blocker = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded blocker task",
				status: "open",
			})
		).id;
		created.blocked = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded blocked task",
				status: "open",
			})
		).id;
		await callTool(request, "tasks_add_blocker", {
			task_id: created.blocked,
			blocked_by: created.blocker,
		});

		created.open = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded open task",
				status: "open",
				description: "A task seeded through the rest api",
				scope,
				tags: [tag],
				priority: "high",
			})
		).id;
		created.closeable = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded closeable task",
				status: "open",
			})
		).id;
		created.attachable = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded attachment task",
				status: "open",
			})
		).id;
		created.deletable = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded deletable task",
				status: "open",
			})
		).id;
		created.low = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded low task",
				status: "open",
				priority: "low",
			})
		).id;
		created.critical = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded critical task",
				status: "open",
				priority: "critical",
			})
		).id;
		created.done = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded done task",
				status: "open",
			})
		).id;
		await callTool(request, "tasks_close", {
			task_id: created.done,
			reason: "fixed",
		});

		created.completionDone = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded completion done task",
				status: "open",
			})
		).id;
		await callTool(request, "tasks_close", {
			task_id: created.completionDone,
			reason: "fixed",
		});
		created.completionCancelled = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded completion cancelled task",
				status: "open",
			})
		).id;
		await callTool(request, "tasks_close", {
			task_id: created.completionCancelled,
			reason: "obsolete",
		});
		created.completionOpenA = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded completion open task A",
				status: "open",
			})
		).id;
		created.completionOpenB = (
			await callTool(request, "tasks_create", {
				project_id: project,
				title: "Seeded completion open task B",
				status: "open",
			})
		).id;
	}

	return {
		project,
		prefix,
		scope,
		tag,
		suffix,
		newProjectName,
		newProjectPrefix,
		created,
		rpc,
		notify,
		callTool,
		taskIds,
		seed,
	};
}
