import type { Attachment } from "./attachments";
import { activityEntry, type ActivityEntry } from "./activity";

type AttachedFile = Pick<Attachment, "id" | "task_id" | "file_name">;

function attachmentEntry(
	attachment: AttachedFile,
	present: boolean,
): ActivityEntry {
	return activityEntry(
		"task",
		attachment.task_id,
		["attachments"],
		[
			{
				field: "attachments",
				from: present ? null : attachment.file_name,
				to: present ? attachment.file_name : null,
				ref_id: attachment.id,
			},
		],
	);
}

export const attachmentActivity = {
	added: (attachment: AttachedFile) => attachmentEntry(attachment, true),
	deleted: (attachment: AttachedFile) => attachmentEntry(attachment, false),
	restored: (attachment: AttachedFile) => attachmentEntry(attachment, true),
	purged: (attachment: AttachedFile) => attachmentEntry(attachment, false),
};
