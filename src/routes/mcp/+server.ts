import type { McpServer } from "@modelcontextprotocol/server";
import { isHttpError, type RequestEvent } from "@sveltejs/kit";
import { createMcpHandler } from "mcp-handler";
import { prettifyError, ZodError } from "zod";
import { runOp } from "#lib/remote/define.ts";
import { getOps } from "#lib/remote/index.ts";
import { version } from "../../../package.json";

function errorMessage(error: unknown): string {
	if (error instanceof ZodError) {
		return prettifyError(error);
	}
	if (isHttpError(error)) {
		return error.body.message;
	}
	return error instanceof Error ? error.message : String(error);
}

function registerTools(server: McpServer): void {
	for (const op of getOps().values()) {
		server.registerTool(
			op.name,
			{ description: op.description, inputSchema: op.input },
			async (args) => {
				try {
					const value = await runOp(op, args);
					return {
						content: [{ type: "text", text: JSON.stringify(value ?? null) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: errorMessage(error) }],
						isError: true,
					};
				}
			},
		);
	}
}

const handler = createMcpHandler(registerTools, {
	serverInfo: { name: "xboct-log", version },
	instructions:
		"Task backlog server for a single user. Use tasks_*, projects_* and " +
		"scopes_* tools to list, create, update and delete tasks, projects " +
		"and scopes. All tools accept a single JSON object argument.",
});

async function handle({ request }: RequestEvent): Promise<Response> {
	return handler(request);
}

export { handle as GET, handle as POST };
