import type { ActivityValue } from "#lib/types.ts";

const FIELD_LABELS: Record<string, string> = {
	title: "Title",
	description: "Description",
	status: "Status",
	priority: "Priority",
	estimate: "Estimate",
	assignee: "Assignee",
	due_at: "Due date",
	is_epic: "Epic",
	epic_id: "Epic",
	scope_id: "Scope",
	project_id: "Project",
	source_file: "Source file",
	tags: "Tags",
	closed_reason: "Closed reason",
	deleted_at: "Deleted",
	blocked_by: "Blocked by",
	blocked_reason: "Blocked reason",
	blocks: "Blocks",
	relates_to: "Relates to",
	duplicates: "Duplicates",
	duplicated_by: "Duplicated by",
	comments: "Comments",
	attachments: "Attachments",
	name: "Name",
	prefix: "Prefix",
	repo: "Repository",
	archived: "Archived",
};

const OP_LABELS: Record<string, string> = {
	tasks_comments_add: "Comment added",
	tasks_comments_edit: "Comment edited",
	tasks_comments_delete: "Comment deleted",
	tasks_add_blocker: "Blocker added",
	tasks_remove_blocker: "Blocker removed",
	tasks_add_link: "Link added",
	tasks_remove_link: "Link removed",
	attachments_add: "Attachment added",
	attachments_delete: "Attachment deleted",
	attachments_restore: "Attachment restored",
	attachments_purge: "Attachment removed",
	attachments_move: "Attachment moved",
	attachments_copy: "Attachment copied",
};

const ACTION_LABELS: Record<string, string> = {
	create: "created",
	update: "updated",
	close: "closed",
	delete: "deleted",
	restore: "restored",
	move: "moved",
	rename: "renamed",
	reorder: "reordered",
	add: "added",
	remove: "removed",
	link: "linked",
	unlink: "unlinked",
	archive: "archived",
};

const ACTION_OP =
	/^(.+)_(create|update|close|delete|restore|move|rename|reorder|add|remove|link|unlink|archive)(_many)?$/;

function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function entityLabel(prefix: string): string {
	const parts = prefix.split("_");
	const word = parts[parts.length - 1] ?? prefix;
	const singular =
		word.length > 2 && word.endsWith("s") && !word.endsWith("ss")
			? word.slice(0, -1)
			: word;
	return capitalize(singular);
}

export function activityOpLabel(op: string): string {
	const explicit = OP_LABELS[op];
	if (explicit !== undefined) {
		return explicit;
	}
	const match = ACTION_OP.exec(op);
	if (match) {
		const entity = entityLabel(match[1]);
		return `${match[3] ? `${entity}s` : entity} ${ACTION_LABELS[match[2]]}`;
	}
	return op.split("_").map(capitalize).join(" ");
}

export function activityFieldLabel(field: string): string {
	return FIELD_LABELS[field] ?? field;
}

export function activityValueLabel(value: ActivityValue): string {
	if (value === null) {
		return "—";
	}
	if (Array.isArray(value)) {
		return value.length === 0 ? "—" : value.join(", ");
	}
	return String(value);
}
