import { error } from "@sveltejs/kit";
import { z } from "zod";
import { getDb } from "../server/db";
import * as repo from "../server/tasks";
import { CLOSED_REASONS, PRIORITIES, STATUSES } from "../types";
import { defineCommand, defineQuery } from "./define";

const taskFilters = z
	.object({
		project_id: z.string().min(1).optional(),
		status: z
			.preprocess(
				(val) =>
					val === undefined ? undefined : Array.isArray(val) ? val : [val],
				z.array(z.enum(STATUSES)).optional(),
			)
			.optional(),
		priority: z
			.preprocess(
				(val) =>
					val === undefined ? undefined : Array.isArray(val) ? val : [val],
				z.array(z.enum(PRIORITIES)).optional(),
			)
			.optional(),
		tag: z
			.preprocess(
				(val) =>
					val === undefined ? undefined : Array.isArray(val) ? val : [val],
				z.array(z.string()).optional(),
			)
			.optional(),
		is_epic: z.boolean().optional(),
		epic_id: z.string().nullable().optional(),
		scope_id: z.number().int().nullable().optional(),
		q: z
			.string()
			.optional()
			.describe(
				"Search by substring across title, description, id and tags (case-insensitive).",
			),
		title: z
			.string()
			.optional()
			.describe("Case-insensitive substring match on the task title."),
		title_exact: z
			.string()
			.optional()
			.describe("Case-insensitive exact match on the task title."),
		fields: z
			.string()
			.optional()
			.describe(
				"Comma-separated list of fields to reduce response size (e.g. id,number,title,status). Requesting 'description' also returns the full text.",
			),
		include_description: z
			.boolean()
			.optional()
			.describe(
				"Include the full description. By default each task carries short_description (first line, trimmed, truncated to ~120 chars) instead.",
			),
		include_project: z
			.boolean()
			.optional()
			.describe(
				"Attach the project name (project_name) to each task. Does not filter by project archival; use project_archived for that.",
			),
		project_archived: z
			.boolean()
			.optional()
			.describe(
				"Filter by project archival: false — active projects only, true — archived projects only. Omitted — both.",
			),
		sort: z.enum(["updated_at", "created_at", "priority"]).optional(),
		order: z.enum(["asc", "desc"]).optional(),
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
	})
	.default({ limit: 100 });

const newTask = z.object({
	project_id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	status: z.enum(STATUSES).optional(),
	priority: z.enum(PRIORITIES).optional(),
	is_epic: z.boolean().optional(),
	epic_id: z.string().nullable().optional(),
	scope_id: z.number().int().nullable().optional(),
	source_file: z.string().nullable().optional(),
	source_line: z.number().int().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

const taskPatch = z.object({
	title: z.string().min(1).optional(),
	description: z.string().optional(),
	status: z.enum(STATUSES).optional(),
	priority: z.enum(PRIORITIES).optional(),
	is_epic: z.boolean().optional(),
	epic_id: z.string().nullable().optional(),
	scope_id: z.number().int().nullable().optional(),
	source_file: z.string().nullable().optional(),
	source_line: z.number().int().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

export const getTasks = defineQuery({
	name: "tasks_list",
	description:
		"List tasks with filters (project, status, priority, tags, epic, scope, text query, title, title_exact), sorting and pagination. Use q to locate a task by id, title, description or tag (e.g. q='LOG-4'). Returns {items, total} where total is the count of all matching tasks before limit/offset. limit defaults to 100 (max 1000); use offset and total to paginate. Use fields to limit returned columns. By default each task carries short_description (first line, ~120 chars) instead of the full description; set include_description to get the full text. include_project attaches project names and never filters; project_archived filters by project archival.",
	kind: "query",
	input: taskFilters,
	handler: (filters) => {
		const db = getDb();
		return {
			items: repo.listTasks(db, filters),
			total: repo.countTasks(db, filters),
		};
	},
});

export const getTasksByIds = defineQuery({
	name: "tasks_get_many",
	description:
		"Get multiple tasks by their IDs in a single call. Use this instead of calling tasks_get in a loop.",
	kind: "query",
	input: z.object({
		ids: z
			.array(z.string().min(1))
			.min(1)
			.max(100)
			.describe("List of task IDs to fetch."),
	}),
	handler: ({ ids }) => repo.getTasksByIds(getDb(), ids),
});

export const getTask = defineQuery({
	name: "tasks_get",
	description: "Get a single task by its id.",
	kind: "query",
	input: z.object({ id: z.string().min(1) }),
	handler: ({ id }) => {
		const task = repo.getTask(getDb(), id);
		if (!task) {
			error(404, `task ${id} not found`);
		}
		return task;
	},
});

export const createTask = defineCommand({
	name: "tasks_create",
	description:
		"Create a task. Requires project_id and title; status, priority, epic, scope, tags are optional.",
	kind: "command",
	input: newTask,
	handler: (input) => repo.createTask(getDb(), input),
});

export const updateTask = defineCommand({
	name: "tasks_update",
	description: "Update fields of an existing task by id.",
	kind: "command",
	input: z.object({ id: z.string().min(1), patch: taskPatch }),
	handler: ({ id, patch }) => repo.updateTask(getDb(), id, patch),
});

export const closeTask = defineCommand({
	name: "tasks_close",
	description:
		"Close a task by id with a reason: 'fixed' → done, 'wontfix' | 'obsolete' | 'duplicate' → cancelled.",
	kind: "command",
	input: z.object({ id: z.string().min(1), reason: z.enum(CLOSED_REASONS) }),
	handler: ({ id, reason }) => repo.closeTask(getDb(), id, reason),
});

export const deleteTask = defineCommand({
	name: "tasks_delete",
	description: "Soft-delete a task by id.",
	kind: "command",
	input: z.object({ id: z.string().min(1) }),
	handler: ({ id }) => repo.deleteTask(getDb(), id),
});

export const moveTask = defineCommand({
	name: "tasks_move",
	description: "Move a task to another project.",
	kind: "command",
	input: z.object({ id: z.string().min(1), project_id: z.string().min(1) }),
	handler: ({ id, project_id }) => repo.moveTask(getDb(), id, project_id),
});
