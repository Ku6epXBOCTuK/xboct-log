import { TASK_BASE_FIELDS } from "./rows";

export const TASK_EXTRA_FIELDS = [
	"short_description",
	"blocked_by",
	"blocks",
] as const;

export const TASK_LIST_FIELDS: string[] = [
	...TASK_BASE_FIELDS,
	...TASK_EXTRA_FIELDS,
];

export const FIELDS_DESCRIPTION =
	`Comma-separated list of fields to reduce response size (e.g. id,number,title,status). ` +
	`Supported fields: ${TASK_LIST_FIELDS.join(", ")}. ` +
	"Requesting 'description' also returns the full text and drops short_description. " +
	"project_name is present only with include_project, scope_name only with include_scope. " +
	"Unknown field names are ignored; if no name matches, the whole task is returned.";
