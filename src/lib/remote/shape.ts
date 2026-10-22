export const TASK_FIELDS =
	"{id, project_id, number, title, description, status, priority, is_epic, epic_id, scope_id, source_file, tags, estimate, assignee, due_at, attachments_count, created_at, updated_at, closed_at, closed_reason, deleted_at, blocked_by, blocks}";

export const COMMENT_FIELDS =
	"{id, task_id, body, created_at, edited_at, deleted_at}";

export const PROJECT_FIELDS = "{id, name, prefix, created_at, archived_at}";

export const SCOPE_FIELDS =
	"{id, project_id, name, created_at, task_count, epics_count}";

export const ATTACHMENT_FIELDS =
	"{id, task_id, file_name, mime_type, size, created_at, missing}";
