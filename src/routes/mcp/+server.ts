import type { McpServer } from "@modelcontextprotocol/server";
import { ResourceTemplate } from "@modelcontextprotocol/server";
import { isHttpError, type RequestEvent } from "@sveltejs/kit";
import { createMcpHandler } from "mcp-handler";
import { prettifyError, ZodError } from "zod";
import { clientLabel } from "#lib/mcp/client-label.ts";
import { runOp } from "#lib/remote/define.ts";
import { getOps } from "#lib/remote/index.ts";
import {
	listAllAttachments,
	readAttachmentResource,
} from "#lib/server/attachments.ts";
import { getDb } from "#lib/server/db.ts";
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
			{
				description: op.description,
				inputSchema: op.input,
				outputSchema: op.output,
			},
			async (args, ctx) => {
				try {
					const value = await runOp(
						op,
						args,
						"mcp",
						clientLabel(ctx.mcpReq.envelope),
					);
					const payload = Array.isArray(value)
						? { items: value }
						: (value ?? null);
					if (op.name.startsWith("attachments_")) {
						refreshResourceList(server);
					}
					return {
						content: [{ type: "text", text: JSON.stringify(payload) }],
						structuredContent: payload,
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
	registerAttachmentResource(server);
}

const ATTACHMENT_INDEX_URI = "xboct-log://attachments";

function refreshResourceList(server: McpServer): void {
	try {
		server.sendResourceListChanged();
	} catch {
		// NOTE: no client subscribed to the notification, its catalog refreshes on the next connect
	}
}

function registerAttachmentResource(server: McpServer): void {
	server.registerResource(
		"attachments",
		ATTACHMENT_INDEX_URI,
		{
			title: "Task attachments",
			description:
				"Every attachment of the backlog with the uri that holds its bytes. Read it when attachments may have been added or removed since the client connected.",
			mimeType: "application/json",
		},
		(uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "application/json",
					text: JSON.stringify(
						listAllAttachments(getDb()).filter((item) => !item.missing),
					),
				},
			],
		}),
	);
	server.registerResource(
		"attachment",
		new ResourceTemplate("xboct-log://attachment/{id}", {
			list: () => ({
				resources: listAllAttachments(getDb())
					.filter((item) => !item.missing)
					.map((item) => ({
						uri: item.uri,
						name: `${item.task_id} ${item.file_name}`,
						mimeType: item.mime_type ?? "application/octet-stream",
					})),
			}),
		}),
		{
			title: "Task attachment",
			description:
				"The file of one task attachment, base64-encoded. Take the uri from attachments_list. Files over 8 MB are not served as a resource: fetch them from /media/{id}.",
			mimeType: "application/octet-stream",
		},
		(uri, variables) => {
			const raw = variables.id;
			const id = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
			const result = readAttachmentResource(getDb(), id);
			if (result.isErr()) {
				throw new Error(result.error.message);
			}
			const { attachment, data } = result.value;
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: attachment.mime_type ?? "application/octet-stream",
						blob: data.toString("base64"),
					},
				],
			};
		},
	);
}

const handler = createMcpHandler(registerTools, {
	serverInfo: { name: "xboct-log", version },
	instructions:
		"Task backlog server for a single user. Use tasks_*, projects_*, " +
		"scopes_* and tags_list tools to list, create, update and delete " +
		"tasks, projects and scopes. tags_list returns the tag dictionary. " +
		"tasks_revisions_list reads the previous description and comment " +
		"texts of a task. " +
		"tasks_deleted_list returns the soft-deleted tasks, the ones that " +
		"tasks_restore can bring back. " +
		"attachments_list, attachments_add, attachments_delete and " +
		"attachments_verify work with the files of a task: they are kept in " +
		"the media folder, and attachments_verify reports the files that are " +
		"gone from it. " +
		"Every attachment is also a resource: read xboct-log://attachment/{id} " +
		"with resources/read to get its bytes, take the uri from " +
		"attachments_list. The resource xboct-log://attachments lists them " +
		"all. " +
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
