import type { McpServer } from "@modelcontextprotocol/server";
import { isHttpError, type RequestEvent } from "@sveltejs/kit";
import { createMcpHandler } from "mcp-handler";
import { prettifyError, ZodError } from "zod";
import { runOp } from "#lib/remote/define.ts";
import { getOps } from "#lib/remote/index.ts";
import { kindForStatus, type ErrorKind } from "#lib/server/errors.ts";
import { version } from "../../../package.json";

interface ToolError {
	kind: ErrorKind;
	message: string;
}

function errorPayload(error: unknown): ToolError {
	if (error instanceof ZodError) {
		return { kind: "validation", message: prettifyError(error) };
	}
	if (isHttpError(error)) {
		return {
			kind: kindForStatus(error.status),
			message: error.body.message,
		};
	}
	return {
		kind: "unexpected",
		message: error instanceof Error ? error.message : String(error),
	};
}

function registerTools(server: McpServer): void {
	for (const op of getOps().values()) {
		server.registerTool(
			op.name,
			{ description: op.description, inputSchema: op.input },
			async (args) => {
				try {
					const value = await runOp(op, args, "mcp");
					return {
						content: [{ type: "text", text: JSON.stringify(value ?? null) }],
						structuredContent: value ?? null,
					};
				} catch (error) {
					const failure = errorPayload(error);
					return {
						content: [{ type: "text", text: failure.message }],
						structuredContent: { error: failure },
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
		"Task backlog server for a single user. Use tasks_*, projects_*, " +
		"scopes_* and tags_list tools to list, create, update and delete " +
		"tasks, projects and scopes. tags_list returns the tag dictionary. " +
		"tasks_revisions_list reads the previous description and comment " +
		"texts of a task. tasks_board returns the backlog grouped by status. " +
		"Comments are written for a human: short, " +
		"factual, no dumps and no volatile details. " +
		"backup_create makes a manual database backup, " +
		"backup_list shows the existing snapshots. Restoring a backup is " +
		"not part of these tools: ask the user to restore it themselves. " +
		"Check isError before reading the payload: a failed call explains " +
		"the cause in the text, and errors raised by the tool itself also " +
		"carry structuredContent.error = { kind, message }. " +
		"Create tasks in batches with tasks_create_many: it answers with one " +
		"result per item instead of one call per task. " +
		"All tools accept a single JSON object argument.",
});

async function handle({ request }: RequestEvent): Promise<Response> {
	return handler(request);
}

export { handle as GET, handle as POST };
