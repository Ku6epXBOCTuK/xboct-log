import type { RequestEvent } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";
import { getOps } from "#lib/remote/index.ts";
import { GET, POST } from "./+server.js";

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
		content?: unknown[];
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
		expect(
			Array.isArray(
				(body.result?.structuredContent as { result?: unknown }).result,
			),
		).toBe(true);
		expect(body.result?.structuredContent).toBeDefined();
	});

	it("returns structuredContent on tool call", async () => {
		const body = await rpc("tools/call", {
			name: "tasks_list",
			arguments: {},
		});
		expect(body.error).toBeUndefined();
		expect(body.result?.structuredContent).toBeDefined();
		expect(
			Array.isArray(
				(body.result?.structuredContent as { result?: unknown }).result,
			),
		).toBe(true);
	});
});
