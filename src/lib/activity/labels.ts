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
	blocks: "Blocks",
	relates_to: "Relates to",
	duplicates: "Duplicates",
	duplicated_by: "Duplicated by",
	comments: "Comments",
	name: "Name",
	prefix: "Prefix",
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
};

const ENTITY_LABELS: Record<string, string> = {
	tasks: "Task",
	projects: "Project",
	scopes: "Scope",
};

const ACTION_LABELS: Record<string, string> = {
	create: "created",
	update: "updated",
	close: "closed",
	delete: "deleted",
	restore: "restored",
	move: "moved",
};

export function activityOpLabel(op: string): string {
	const explicit = OP_LABELS[op];
	if (explicit !== undefined) {
		return explicit;
	}
	const match = /^(tasks|projects|scopes)_(.+)$/.exec(op);
	if (match) {
		const entity = ENTITY_LABELS[match[1]];
		const many = match[2].endsWith("_many");
		const action = many ? match[2].slice(0, -"_many".length) : match[2];
		const verb = ACTION_LABELS[action];
		if (entity !== undefined && verb !== undefined) {
			return `${many ? `${entity}s` : entity} ${verb}`;
		}
	}
	const action = op
		.replace(/^(tasks|projects|scopes)_/, "")
		.replace(/_many$/, "");
	if (action === op) return op;
	const text = action.replace(/_/g, " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
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
