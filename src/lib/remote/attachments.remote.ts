import { err } from "neverthrow";
import { z } from "zod";
import {
	addAttachmentFromBase64,
	addAttachmentFromPath,
	deleteAttachment,
	listAttachments,
	verifyAttachments,
} from "../server/attachments";
import { getDb } from "../server/db";
import { invalid } from "../server/errors";
import {
	attachmentCreated,
	attachmentDeleted,
	attachmentList,
	attachmentVerify,
} from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { ATTACHMENT_FIELDS } from "./shape";
import { strictObject } from "./strict";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";

export const getTaskAttachments = defineQuery({
	name: "attachments_list",
	output: attachmentList,
	description:
		"List the files attached to one task. Read-only. Returns: {items} - every item is " +
		ATTACHMENT_FIELDS +
		". The uri of an item is an MCP resource holding the bytes of the file: read it with resources/read instead of looking for the file on disk. A file that is gone from the media folder is still listed, with missing set to true.",
	kind: "query",
	input: strictObject({
		task_id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ task_id }) => {
		const db = getDb();
		return { items: listAttachments(db, resolveTaskOrThrow(db, task_id)) };
	},
});

export const addTaskAttachment = defineCommand({
	name: "attachments_add",
	output: attachmentCreated,
	description:
		"Attach a file to a task. The file is stored in the media folder of the app, the task keeps only a reference to it. Give either path (a file on the machine where the app runs) or content_base64 (the file content encoded as base64) together with filename. Returns: {item} - the created attachment - " +
		ATTACHMENT_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		task_id: taskIdSchema(ID_DESCRIPTION),
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
	handler: ({ task_id, filename, path, content_base64, mime_type }) => {
		const db = getDb();
		const taskId = resolveTaskOrThrow(db, task_id);
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
			return err(invalid("give either path or content_base64"));
		}
		if (result.isErr()) {
			return err(result.error);
		}
		return { item: result.value };
	},
});

export const removeTaskAttachment = defineCommand({
	name: "attachments_delete",
	output: attachmentDeleted,
	description:
		"Delete one attachment of a task: the file in the media folder and the reference to it. The attachment_id is the `id` field of an item from attachments_list. Returns: {id} - the id of the deleted attachment.",
	kind: "command",
	input: strictObject({
		attachment_id: z
			.string()
			.uuid()
			.describe("The `id` of an attachment from attachments_list."),
	}),
	handler: ({ attachment_id }) => {
		const result = deleteAttachment(getDb(), attachment_id);
		if (result.isErr()) {
			return err(result.error);
		}
		return result.value;
	},
});

export const checkTaskAttachments = defineQuery({
	name: "attachments_verify",
	output: attachmentVerify,
	description:
		"Check the files of the attachments: which ones are still in the media folder and which ones are gone. Read-only. Returns: {ok, missing} - ok is the list of attachments still in the media folder, missing the ones that are gone. Give task_id to check one task only, omit it to check everything.",
	kind: "query",
	input: strictObject({
		task_id: taskIdSchema(ID_DESCRIPTION).optional(),
	}),
	handler: ({ task_id }) => {
		const db = getDb();
		const taskId =
			task_id === undefined ? undefined : resolveTaskOrThrow(db, task_id);
		return verifyAttachments(db, taskId);
	},
});
