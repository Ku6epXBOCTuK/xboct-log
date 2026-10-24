import { taskIdSchema } from "#lib/tasks/ids.ts";
import { z } from "zod";
import { FIELDS_DESCRIPTION } from "../server/tasks/field-names";
import { ESTIMATES, PRIORITIES, STATUSES } from "../types";
import { oneOrList } from "./list";
import { strictObject } from "./strict";

const taskFilterShape = {
	project_id: oneOrList(z.array(z.string().min(1)).optional()).describe(
		"Filter by project id (e.g. 'eit'). Accepts one id or a list of ids; a list matches tasks of any of them.",
	),
	exclude_project_id: oneOrList(z.array(z.string().min(1)).optional()).describe(
		"Exclude projects: only tasks of other projects are returned. Accepts one id or a list of ids. Combine with project_id to get 'every project except X'.",
	),
	status: oneOrList(z.array(z.enum(STATUSES)).optional()),
	priority: oneOrList(z.array(z.enum(PRIORITIES)).optional()),
	estimate: oneOrList(z.array(z.enum(ESTIMATES)).optional()).describe(
		"Filter by estimate: one value or a list of them. Tasks without an estimate are not matched.",
	),
	assignee: oneOrList(z.array(z.string().min(1)).optional()).describe(
		"Filter by assignee: one name or a list of them, matched case-insensitively. Tasks without an assignee are not matched.",
	),
	due_before: z
		.string()
		.optional()
		.describe(
			"Filter by due date: only tasks due strictly before this date (YYYY-MM-DD). Tasks without a due date are not matched.",
		),
	due_after: z
		.string()
		.optional()
		.describe(
			"Filter by due date: only tasks due on or after this date (YYYY-MM-DD). Tasks without a due date are not matched.",
		),
	tag: oneOrList(z.array(z.string()).optional()).describe(
		"Exact tag match, case-insensitive; no wildcards. Use q to match a partial tag.",
	),
	is_epic: z.boolean().optional(),
	epic_id: oneOrList(
		z
			.array(
				taskIdSchema(
					"Epic id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-5').",
				),
			)
			.nullable()
			.optional(),
	).describe(
		"Filter by epic. Accepts the full epic id (e.g. 'LOG-5') or a list of them; a list matches tasks of any of the given epics. null matches tasks without an epic.",
	),
	scope_id: z
		.union([z.number().int(), z.array(z.number().int()).min(1)])
		.nullable()
		.optional()
		.describe(
			"Filter by scope id. Accepts one scope id or a list of them; a list matches tasks of any of the given scopes. null matches tasks without a scope.",
		),
	has_epic: z
		.boolean()
		.optional()
		.describe(
			"Filter by the presence of an epic: true matches tasks that belong to an epic, false matches tasks without one.",
		),
	has_scope: z
		.boolean()
		.optional()
		.describe(
			"Filter by the presence of a scope: true matches tasks with a scope assigned, false matches tasks without one.",
		),
	has_tags: z
		.boolean()
		.optional()
		.describe(
			"Filter by the presence of tags: true matches tasks with at least one tag, false matches tasks without tags.",
		),
	blocked_by: taskIdSchema(
		"Full task id (e.g. 'LOG-5') of the blocker: returns tasks whose blocked_by list contains it.",
	)
		.optional()
		.describe(
			"Filter by the blocked_by list: returns tasks whose blocked_by list contains the given task (the tasks it blocks).",
		),
	blocks: taskIdSchema(
		"Full task id (e.g. 'LOG-5') of the blocked task: returns tasks whose blocks list contains it.",
	)
		.optional()
		.describe(
			"Filter by the blocks list: returns tasks whose blocks list contains the given task (the tasks blocking it).",
		),
	q: z
		.string()
		.optional()
		.describe(
			"Case-insensitive substring search across title, description, id, the id of the epic and tags. Tags match by substring: q='est:' finds tasks with a tag like 'est:L'. Use tag for a whole-tag match.",
		),
	title: z
		.string()
		.optional()
		.describe("Case-insensitive substring match on the task title."),
	title_exact: z
		.string()
		.optional()
		.describe("Case-insensitive exact match on the task title."),
	source_file: z
		.string()
		.optional()
		.describe(
			"Case-insensitive substring match on the source file path of the task (e.g. 'backlog.md'). Tasks without a source file are excluded.",
		),
	fields: z.string().optional().describe(FIELDS_DESCRIPTION),
	include_description: z
		.boolean()
		.optional()
		.describe(
			"Include the full description. By default each task carries short_description (first line, trimmed, truncated to ~120 chars) instead of the full text; with include_description the full text is returned and short_description is omitted.",
		),
	include_project: z
		.boolean()
		.optional()
		.describe(
			"Attach the project name (project_name) to each task. Does not filter by project archival; use project_archived for that.",
		),
	include_scope: z
		.boolean()
		.optional()
		.describe("Attach the scope name (scope_name) to each task."),
	project_archived: z
		.boolean()
		.optional()
		.describe(
			"Filter by project archival: false - active projects only, true - archived projects only. Omitted - both.",
		),
	sort: z
		.enum([
			"updated_at",
			"created_at",
			"closed_at",
			"priority",
			"number",
			"title",
		])
		.optional()
		.describe(
			"Sort key. 'number' orders by the per-project task number (ascending by default), 'title' orders by title case-insensitively (ascending by default); 'updated_at' and 'created_at' default to descending, 'priority' to ascending. 'closed_at' orders by the closing date and keeps the tasks that are not closed at the end.",
		),
	order: z
		.enum(["asc", "desc"])
		.optional()
		.describe(
			"Sort direction. Defaults to asc for priority, number and title, desc for the date keys.",
		),
	include_deleted: z
		.boolean()
		.optional()
		.describe(
			"Include soft-deleted tasks. By default they are hidden; with true the deleted_at field is populated.",
		),
};

export const taskFilters = strictObject({
	...taskFilterShape,
	limit: z
		.number()
		.int()
		.positive()
		.max(1000)
		.default(100)
		.describe(
			"Maximum number of tasks to return (default 100, max 1000). Combine with offset and the response total to paginate.",
		),
	offset: z.number().int().nonnegative().optional(),
}).default({ limit: 100 });

export const boardFilters = strictObject({
	...taskFilterShape,
	limit: z
		.number()
		.int()
		.positive()
		.max(200)
		.default(50)
		.describe(
			"Maximum number of tasks in every column (default 50, max 200). The count of a column is not limited.",
		),
});
