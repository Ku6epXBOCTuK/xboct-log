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
	name: "Name",
	prefix: "Prefix",
	archived: "Archived",
};

export function activityOpLabel(op: string): string {
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
