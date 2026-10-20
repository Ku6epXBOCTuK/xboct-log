import type { ActivityValue } from "#lib/types.ts";

const FIELD_LABELS: Record<string, string> = {
	title: "Title",
	description: "Description",
	status: "Status",
	priority: "Priority",
	is_epic: "Epic",
	epic_id: "Epic",
	scope_id: "Scope",
	project_id: "Project",
	source_file: "Source file",
	source_line: "Source line",
	tags: "Tags",
	closed_reason: "Closed reason",
	deleted_at: "Deleted",
	blocked_by: "Blocked by",
	comments: "Comments",
	name: "Name",
	prefix: "Prefix",
	archived: "Archived",
};

const OP_LABELS: Record<string, string> = {
	tasks_comments_add: "Comment added",
	tasks_comments_edit: "Comment edited",
	tasks_comments_delete: "Comment deleted",
};

export function activityOpLabel(op: string): string {
	const explicit = OP_LABELS[op];
	if (explicit !== undefined) {
		return explicit;
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
