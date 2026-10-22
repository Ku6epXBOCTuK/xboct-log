import { error } from "@sveltejs/kit";
import { z } from "zod";
import {
	addAttachmentFromBase64,
	addAttachmentFromPath,
	deleteAttachment,
	listAttachments,
	verifyAttachments,
} from "../server/attachments";
import { getDb } from "../server/db";
import * as repo from "../server/tasks";
import { defineCommand, defineQuery } from "./define";
import { ATTACHMENT_FIELDS } from "./shape";
import { strictObject } from "./strict";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";

function resolve(db: ReturnType<typeof getDb>, id: string): string {
	const resolved = repo.resolveTaskId(db, id);
	if (resolved.isErr()) {
		error(resolved.error.status, resolved.error.message);
	}
	return resolved.value;
}

export const getTaskAttachments = defineQuery({
	name: "attachments_list",
	description:
		"List the files attached to one task. Read-only. Returns: {items} - every item is " +
		ATTACHMENT_FIELDS +
		". A file that is gone from the media folder is still listed, with missing set to true.",
	kind: "query",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ id }) => {
		const db = getDb();
		return { items: listAttachments(db, resolve(db, id)) };
	},
});

export const addTaskAttachment = defineCommand({
	name: "attachments_add",
	description:
		"Attach a file to a task. The file is stored in the media folder of the app, the task keeps only a reference to it. Give either path (a file on the machine where the app runs) or content_base64 (the file content encoded as base64) together with filename. Returns: {item} - the created attachment - " +
		ATTACHMENT_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
		filename: z
			.string()
			.min(1)
			.describe(
				"The name of the file as it should be shown, with its extension.",
			),
		path: z
			.string()
			.min(1)
			.optional()
			.describe(
				"A path to the file on the machine where the app runs. Use it instead of content_base64 when the file is already there.",
			),
		content_base64: z
			.string()
			.min(1)
			.optional()
			.describe("The content of the file encoded as base64."),
		mime_type: z
			.string()
			.min(1)
			.optional()
			.describe("The content type of the file, for example image/png."),
	}),
	handler: ({ id, filename, path, content_base64, mime_type }) => {
		const db = getDb();
		const taskId = resolve(db, id);
		const result =
			path !== undefined
				? addAttachmentFromPath(db, taskId, path)
				: content_base64 !== undefined
					? addAttachmentFromBase64(
							db,
							taskId,
							filename,
							content_base64,
							mime_type,
						)
					: null;
		if (result === null) {
			error(400, "give either path or content_base64");
		}
		if (result.isErr()) {
			error(result.error.status, result.error.message);
		}
		return { item: result.value };
	},
});

export const removeTaskAttachment = defineCommand({
	name: "attachments_delete",
	description:
		"Delete one attachment of a task: the file in the media folder and the reference to it. The id is the one returned by attachments_list. Returns: {id} - the id of the deleted attachment.",
	kind: "command",
	input: strictObject({
		id: z.string().uuid().describe("The id of the attachment."),
	}),
	handler: ({ id }) => {
		const result = deleteAttachment(getDb(), id);
		if (result.isErr()) {
			error(result.error.status, result.error.message);
		}
		return result.value;
	},
});

export const checkTaskAttachments = defineQuery({
	name: "attachments_verify",
	description:
		"Check the files of the attachments: which ones are still in the media folder and which ones are gone. Read-only. Returns: {ok, missing} - ok is the list of attachments still in the media folder, missing the ones that are gone. Give id to check one task only, omit it to check everything.",
	kind: "query",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION).optional(),
	}),
	handler: ({ id }) => {
		const db = getDb();
		const taskId = id === undefined ? undefined : resolve(db, id);
		return verifyAttachments(db, taskId);
	},
});
