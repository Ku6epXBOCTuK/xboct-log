import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { getOps } from "#lib/remote/index.ts";
import { closeDb } from "#lib/server/db.ts";
import { GET as healthGET } from "../../src/routes/api/health/+server.ts";
import {
	GET as mcpGET,
	POST as mcpPOST,
} from "../../src/routes/mcp/+server.ts";
import {
	databasePath,
	fixtureDir,
	openRuntimeDatabase,
} from "./lib/runtime.ts";
import { createNormalizer } from "./lib/normalize.ts";

const PROTOCOL_VERSION = "2026-07-28";

function rpcRequest(body: unknown, method = "POST"): Request {
	return new Request("http://localhost/mcp", {
		method,
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
		},
		body: method === "GET" ? undefined : JSON.stringify(body),
	});
}

async function rpc(method: string, params: unknown) {
	const response = await mcpPOST({
		request: rpcRequest({
			jsonrpc: "2.0",
			id: 1,
			method,
			params,
		}),
	} as never);
	const text = await response.text();
	const payload =
		text
			.split("\n")
			.find((line) => line.startsWith("data: "))
			?.slice("data: ".length) ?? text;
	expect(response.status).toBe(200);
	expect(payload).not.toBe("");
	return JSON.parse(payload) as {
		result?: unknown;
		error?: unknown;
	};
}

function schemaOf(schema: z.ZodType | undefined): unknown {
	return schema === undefined
		? null
		: z.toJSONSchema(schema, { reused: "inline" });
}

beforeAll(() => {
	if (!existsSync(databasePath())) {
		throw new Error(
			"the seeded database is missing; run pnpm parity:capture or pnpm parity:seed first",
		);
	}
	openRuntimeDatabase();
});

afterAll(() => {
	closeDb();
});

describe("node contract", () => {
	it("captures the operation registry, the MCP surface and health", async () => {
		const ops = [...getOps().values()]
			.map((op) => ({
				name: op.name,
				kind: op.kind,
				mcp: op.mcp !== false,
				description: op.description,
				input: schemaOf(op.input),
				mcpInput: op.mcpInput === undefined ? null : schemaOf(op.mcpInput),
				output: schemaOf(op.output),
			}))
			.sort((left, right) => left.name.localeCompare(right.name));

		const initialize = await rpc("initialize", {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "parity", version: "0.0.0" },
		});
		const tools = await rpc("tools/list", {});
		const resources = await rpc("resources/list", {});
		const templates = await rpc("resources/templates/list", {});
		const attachments =
			(resources.result as { resources?: { uri?: string }[] } | undefined)
				?.resources ?? [];
		const identities = new Map<string, string>();
		for (const [index, resource] of attachments.entries()) {
			const match = /^xboct-log:\/\/attachment\/(.+)$/.exec(resource.uri ?? "");
			if (match !== null) {
				identities.set(match[1].toLowerCase(), `<attachment:${index + 1}>`);
			}
		}
		const normalizeResources = createNormalizer({
			identities,
			now: Date.now(),
		});
		const getResponse = await mcpGET({
			request: rpcRequest(undefined, "GET"),
		} as never);

		const healthResponse = await healthGET();
		const healthBody = JSON.parse(await healthResponse.text()) as Record<
			string,
			unknown
		>;
		if (typeof healthBody.data === "string") {
			expect(healthBody.data).toMatch(/^[0-9a-f]{16}$/);
			healthBody.data = "<data>";
		}

		const contract = {
			ops,
			mcp: {
				initialize: initialize.result,
				tools: tools.result,
				resources: normalizeResources(resources.result),
				templates: templates.result,
				get: {
					status: getResponse.status,
					body: await getResponse.text(),
				},
			},
			health: {
				status: healthResponse.status,
				headers: Object.fromEntries(healthResponse.headers),
				body: healthBody,
			},
		};

		const toolsList = (tools.result as { tools?: unknown[] } | undefined)
			?.tools;
		expect(ops).toHaveLength(55);
		expect(toolsList).toHaveLength(53);
		expect(initialize.error).toBeUndefined();

		const target = join(fixtureDir(), "contract.json");
		mkdirSync(fixtureDir(), { recursive: true });
		writeFileSync(target, `${JSON.stringify(contract, null, 2)}\n`);
		console.log(`wrote ${target}`);
	});
});
