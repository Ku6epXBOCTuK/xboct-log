import type { DeletedAttachment, TaskAttachment } from "#lib/types.ts";
import { client, unwrap } from "#lib/api/system/client.ts";

export type AttachmentsPage = { items: TaskAttachment[] };
export type DeletedAttachmentsPage = { items: DeletedAttachment[] };

export async function getTaskAttachments(input: {
	task_id: string;
}): Promise<AttachmentsPage> {
	return unwrap<AttachmentsPage>(
		await client.POST("/api/attachments_list", { body: input }),
	);
}

export async function getDeletedAttachments(
	input: { task_id?: string } = {},
): Promise<DeletedAttachmentsPage> {
	return unwrap<DeletedAttachmentsPage>(
		await client.POST("/api/attachments_deleted_list", { body: input }),
	);
}

export async function addTaskAttachment(input: {
	task_id: string;
	filename: string;
	path?: string;
	content_base64?: string;
}): Promise<{ item: TaskAttachment }> {
	return unwrap<{ item: TaskAttachment }>(
		await client.POST("/api/attachments_add", { body: input }),
	);
}

export async function removeTaskAttachment(input: {
	attachment_id: string;
}): Promise<TaskAttachment> {
	return unwrap<TaskAttachment>(
		await client.POST("/api/attachments_delete", { body: input }),
	);
}

export async function restoreTaskAttachment(input: {
	attachment_id: string;
}): Promise<TaskAttachment> {
	return unwrap<TaskAttachment>(
		await client.POST("/api/attachments_restore", { body: input }),
	);
}

export type MovedAttachment = {
	item: TaskAttachment;
	previous_task_id: string;
	was_deleted: boolean;
};

export async function moveTaskAttachment(input: {
	attachment_id: string;
	task_id: string;
}): Promise<MovedAttachment> {
	return unwrap<MovedAttachment>(
		await client.POST("/api/attachments_move", { body: input }),
	);
}

export async function copyTaskAttachment(input: {
	attachment_id: string;
	task_id: string;
}): Promise<{ item: TaskAttachment }> {
	return unwrap<{ item: TaskAttachment }>(
		await client.POST("/api/attachments_copy", { body: input }),
	);
}

export type PurgedAttachment = {
	id: string;
	task_id: string;
	file_name: string;
	file_removed: boolean;
};

export async function purgeTaskAttachment(input: {
	attachment_id: string;
}): Promise<PurgedAttachment> {
	return unwrap<PurgedAttachment>(
		await client.POST("/api/attachments_purge", { body: input }),
	);
}

export async function checkTaskAttachments(
	input: { task_id?: string } = {},
): Promise<{ ok: TaskAttachment[]; missing: TaskAttachment[] }> {
	return unwrap<{ ok: TaskAttachment[]; missing: TaskAttachment[] }>(
		await client.POST("/api/attachments_verify", { body: input }),
	);
}
