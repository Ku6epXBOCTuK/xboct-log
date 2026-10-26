import {
	attachmentSchema,
	commentSchema,
	projectSchema,
	scopeSchema,
	taskSchema,
} from "#lib/entities.ts";

function objectFields(schema: { shape: Record<string, unknown> }): string {
	return `{${Object.keys(schema.shape).join(", ")}}`;
}

export const TASK_FIELDS = objectFields(taskSchema);

export const COMMENT_FIELDS = objectFields(commentSchema);

export const PROJECT_FIELDS = objectFields(projectSchema);

export const SCOPE_FIELDS = objectFields(scopeSchema);

export const ATTACHMENT_FIELDS = objectFields(attachmentSchema);
