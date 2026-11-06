import { err } from "neverthrow";
import { z } from "zod";
import {
	ATTACHMENT_PURGE_KEEP_DAYS,
	addAttachmentFromBase64,
	addAttachmentFromPath,
	type Attachment,
	copyAttachment,
	deleteAttachment,
	listAttachments,
	listDeletedAttachments,
	type MovedAttachment,
	moveAttachment,
	purgeAttachment,
	restoreAttachment,
	verifyAttachments,
} from "../server/attachments";
import { getDb } from "../server/db";
import { invalid } from "../server/errors";
import {
	attachmentCreated,
	attachmentDeleted,
	attachmentDeletedList,
	attachmentList,
	attachmentMoved,
	attachmentPurged,
	attachmentRestored,
	attachmentVerify,
} from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { ATTACHMENT_FIELDS } from "./shape";
import { strictObject } from "./strict";
import { attachmentActivity } from "../server/activity-entries";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";

export const getTaskAttachments = defineQuery({
	name: "attachments_list",
	output: attachmentList,
	description:
		"List the files attached to one task, without the ones deleted. Read-only. Returns: {items} - every item is " +
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

export const getDeletedAttachments = defineQuery({
	name: "attachments_deleted_list",
	output: attachmentDeletedList,
	description:
		"List the soft-deleted attachments, newest deletion first. Read-only. Give task_id to list the deleted attachments of one task only, omit it to list every deleted attachment. Soft-deleted files are kept for " +
		String(ATTACHMENT_PURGE_KEEP_DAYS) +
		" days, then the file and the row are removed for good. Returns: {items} - every item is " +
		ATTACHMENT_FIELDS +
		" with deleted_at set and task_title - the title of the task the file returns to.",
	kind: "query",
	input: strictObject({
		task_id: taskIdSchema(ID_DESCRIPTION).optional(),
	}),
	handler: ({ task_id }) => {
		const db = getDb();
		return {
			items: listDeletedAttachments(
				db,
				task_id === undefined ? undefined : resolveTaskOrThrow(db, task_id),
			),
		};
	},
});

export const addTaskAttachment = defineCommand({
	name: "attachments_add",
	output: attachmentCreated,
	description:
		"Attach a file to a task. The file is stored in the media folder of the app, the task keeps only a reference to it. Use it for a raw log, a dump, a config or a dataset that the task needs and that is too big or too volatile for the text. Give either path (a file on the machine where the app runs) or content_base64 (the file content encoded as base64) together with filename. Returns: {item} - the created attachment - " +
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
	}),
	handler: ({ task_id, filename, path, content_base64 }) => {
		const db = getDb();
		const taskId = resolveTaskOrThrow(db, task_id);
		const result =
			path !== undefined
				? addAttachmentFromPath(db, taskId, path)
				: content_base64 !== undefined
					? addAttachmentFromBase64(db, taskId, filename, content_base64)
					: null;
		if (result === null) {
			return err(invalid("give either path or content_base64"));
		}
		if (result.isErr()) {
			return err(result.error);
		}
		return { item: result.value };
	},
	activity: (_input, result: { item: Attachment }) =>
		attachmentActivity.added(result.item),
});

export const removeTaskAttachment = defineCommand({
	name: "attachments_delete",
	output: attachmentDeleted,
	description:
		"Soft-delete one attachment of a task: the file stays in the media folder and the row keeps its deleted_at, so the attachment can be restored with attachments_restore for " +
		String(ATTACHMENT_PURGE_KEEP_DAYS) +
		" days. It disappears from attachments_list and from the task right away. The attachment_id is the `id` field of an item from attachments_list. Returns: the deleted attachment - " +
		ATTACHMENT_FIELDS +
		" with deleted_at set.",
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
	activity: (_input, attachment: Attachment) =>
		attachmentActivity.deleted(attachment),
});

export const restoreTaskAttachment = defineCommand({
	name: "attachments_restore",
	output: attachmentRestored,
	description:
		"Restore a soft-deleted attachment: it goes back to the task it was attached to, nothing is copied or moved. Find deleted attachments with attachments_deleted_list. Fails when the task is deleted (restore the task first) or when the file is gone from the media folder. Returns: the restored attachment - " +
		ATTACHMENT_FIELDS +
		" with deleted_at set to null.",
	kind: "command",
	input: strictObject({
		attachment_id: z
			.string()
			.uuid()
			.describe("The `id` of an attachment from attachments_deleted_list."),
	}),
	handler: ({ attachment_id }) => {
		const result = restoreAttachment(getDb(), attachment_id);
		if (result.isErr()) {
			return err(result.error);
		}
		return result.value;
	},
	activity: (_input, attachment: Attachment) =>
		attachmentActivity.restored(attachment),
});

export const moveTaskAttachment = defineCommand({
	name: "attachments_move",
	output: attachmentMoved,
	description:
		"Move an attachment to another task. The attachment keeps its id, its uri and its history, only the task it belongs to changes, so links, ref_id values and resources keep working. A soft-deleted attachment can be moved too, and it lands on the target task restored, with deleted_at cleared: that is the way to bring a deleted file back onto a different task. The file is not copied, the bytes stay where they are, so the move works even when the file is already gone from the media folder. Fails when the target is the task the attachment is already on, when the target does not exist or is deleted, and when the attachment_id is unknown. Use attachments_copy when the file should stay on the source task as well. Returns: {item, previous_task_id, was_deleted} - item is the attachment on its new task, previous_task_id is the task it left, was_deleted tells whether it was soft-deleted before the move.",
	kind: "command",
	input: strictObject({
		attachment_id: z
			.string()
			.uuid()
			.describe(
				"The `id` of an attachment from attachments_list or attachments_deleted_list.",
			),
		task_id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ attachment_id, task_id }) => {
		const db = getDb();
		const target = resolveTaskOrThrow(db, task_id);
		const result = moveAttachment(db, attachment_id, target);
		if (result.isErr()) {
			return err(result.error);
		}
		return result.value;
	},
	activity: (_input, result: MovedAttachment) =>
		attachmentActivity.moved(
			result.item,
			result.previous_task_id,
			result.was_deleted,
		),
});

export const copyTaskAttachment = defineCommand({
	name: "attachments_copy",
	output: attachmentCreated,
	description:
		"Copy an attachment to another task. A new, independent attachment is created from the same bytes: it has its own id and uri, its own row and its own file, so deleting, moving or purging one copy does not touch the other. The copy keeps file_name, mime_type and size of the source and gets the current time as created_at. The source attachment is not changed in any way. Use attachments_move when the file belongs to one task and only its task changes. Fails when the target is the task the attachment is already on, when the target does not exist or is deleted, and when the file is gone from the media folder. Returns: {item} - the created attachment - " +
		ATTACHMENT_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		attachment_id: z
			.string()
			.uuid()
			.describe(
				"The `id` of an attachment from attachments_list or attachments_deleted_list.",
			),
		task_id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ attachment_id, task_id }) => {
		const db = getDb();
		const target = resolveTaskOrThrow(db, task_id);
		const result = copyAttachment(db, attachment_id, target);
		if (result.isErr()) {
			return err(result.error);
		}
		return { item: result.value };
	},
	activity: (_input, result: { item: Attachment }) =>
		attachmentActivity.copied(result.item),
});

export const purgeTaskAttachment = defineCommand({
	name: "attachments_purge",
	output: attachmentPurged,
	description:
		"Remove a soft-deleted attachment for good, now instead of waiting for the automatic cleanup: the file in the media folder and the row are gone and cannot be restored. Only works on a soft-deleted attachment. Returns: {id, task_id, file_name, file_removed} - file_removed is false when the file was already gone from the media folder.",
	kind: "command",
	input: strictObject({
		attachment_id: z
			.string()
			.uuid()
			.describe("The `id` of an attachment from attachments_deleted_list."),
	}),
	handler: ({ attachment_id }) => {
		const result = purgeAttachment(getDb(), attachment_id);
		if (result.isErr()) {
			return err(result.error);
		}
		return result.value;
	},
	activity: (
		_input,
		result: { id: string; task_id: string; file_name: string },
	) => attachmentActivity.purged(result),
});

export const checkTaskAttachments = defineQuery({
	name: "attachments_verify",
	output: attachmentVerify,
	description:
		"Check the files of the attachments: which ones are still in the media folder and which ones are gone. Read-only, soft-deleted attachments are skipped. Returns: {ok, missing} - ok is the list of attachments still in the media folder, missing the ones that are gone. Give task_id to check one task only, omit it to check everything.",
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
