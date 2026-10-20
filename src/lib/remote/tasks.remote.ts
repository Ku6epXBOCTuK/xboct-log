import { error } from "@sveltejs/kit";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import * as repo from "../server/tasks";
import type { BatchItem, CreateBatchItem } from "../server/tasks";
import {
	CLOSED_REASONS,
	PRIORITIES,
	STATUSES,
	type Task,
	type TaskWithChanges,
} from "../types";
import { ID_DESCRIPTION, IN_PROJECT_DESCRIPTION } from "#lib/tasks/ids.ts";
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
		epic_id: z
			.string()
			.nullable()
			.optional()
			.describe(
				"Filter by epic. Accepts the full epic id (e.g. 'LOG-5') or a bare epic number (e.g. '5'); a bare number is looked up inside project_id when it is given, otherwise across all projects.",
			),
		scope_id: z.number().int().nullable().optional(),
		blocked_by: z
			.string()
			.optional()
			.describe(
				"Filter by the blocked_by list: returns tasks whose blocked_by list contains the given task (the tasks it blocks). Accepts a full task id (e.g. 'LOG-5') or a bare task number (e.g. '5').",
			),
		blocks: z
			.string()
			.optional()
			.describe(
				"Filter by the blocks list: returns tasks whose blocks list contains the given task (the tasks blocking it). Accepts a full task id (e.g. 'LOG-5') or a bare task number (e.g. '5').",
			),
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
		include_scope: z
			.boolean()
			.optional()
			.describe("Attach the scope name (scope_name) to each task."),
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
		include_deleted: z
			.boolean()
			.optional()
			.describe(
				"Include soft-deleted tasks. By default they are hidden; with true the deleted_at field is populated.",
			),
	})
	.default({ limit: 100 });

const EPIC_ID_DESCRIPTION =
	"Epic id. The full 'PREFIX-NUMBER' form (e.g. 'LOG-5') always resolves. A bare epic number (e.g. '5') is resolved inside the task's own project (project_id on creation, the current project on update). The epic must belong to that project.";

const newTask = z.object({
	project_id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	status: z.enum(STATUSES).optional(),
	priority: z.enum(PRIORITIES).optional(),
	is_epic: z.boolean().optional(),
	epic_id: z.string().nullable().optional().describe(EPIC_ID_DESCRIPTION),
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
	epic_id: z.string().nullable().optional().describe(EPIC_ID_DESCRIPTION),
	scope_id: z.number().int().nullable().optional(),
	source_file: z.string().nullable().optional(),
	source_line: z.number().int().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

export const getTasks = defineQuery({
	name: "tasks_list",
	description:
		"List tasks with filters (project, status, priority, tags, epic, scope, blocked_by, blocks, text query, title, title_exact), sorting and pagination. Use q to locate a task by id, title, description or tag (e.g. q='LOG-4'). Returns {items, total} where total is the count of all matching tasks before limit/offset. limit defaults to 100 (max 1000); use offset and total to paginate. Use fields to limit returned columns. By default each task carries short_description (first line, ~120 chars) instead of the full description; set include_description to get the full text. include_project attaches project names, include_scope attaches scope names, and neither filters; project_archived filters by project archival; include_deleted also returns soft-deleted tasks (hidden by default). Task id is the full 'PREFIX-NUMBER' identifier (e.g. 'LOG-82'); number is the per-project sequence number (e.g. 82), unique only inside its project. The epic filter accepts a full epic id (e.g. 'LOG-5') or a bare epic number (e.g. '5') resolved inside project_id when it is given. The blocked_by filter returns tasks whose blocked_by list contains the given task, the blocks filter returns tasks whose blocks list contains the given task. Every task carries blocked_by (tasks that block me) and blocks (tasks I block) as id lists.",
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
		"Get multiple tasks by their IDs in a single call. Each id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82'). Bare numbers are resolved inside in_project when it is given, otherwise they must be unique across the whole backlog. Returns { items, missing }: items follow the requested order, missing lists ids that do not exist, are soft-deleted, or are ambiguous. Use this instead of calling tasks_get in a loop.",
	kind: "query",
	input: z.object({
		ids: z
			.array(z.string().min(1))
			.min(1)
			.max(100)
			.describe("List of task IDs to fetch."),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ ids, in_project }) =>
		repo.getTasksByIds(getDb(), ids, in_project),
});

export const getTask = defineQuery({
	name: "tasks_get",
	description:
		"Get a single task by id. Id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82'). A bare number is looked up inside in_project when it is given, otherwise it must match exactly one task across the whole backlog, else the call fails listing the candidate full ids.",
	kind: "query",
	input: z.object({
		id: z.string().min(1).describe(ID_DESCRIPTION),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ id, in_project }) => {
		const db = getDb();
		const resolved = repo.resolveTaskId(db, id, in_project);
		if (resolved.isErr()) {
			error(resolved.error.status, resolved.error.message);
		}
		return repo.getTask(db, resolved.value)!;
	},
});

export const createTask = defineCommand({
	name: "tasks_create",
	description:
		"Create a task. Requires project_id and title; status, priority, epic, scope, tags are optional. epic_id accepts a full epic id (e.g. 'LOG-5') or a bare epic number (e.g. '5') resolved inside project_id.",
	kind: "command",
	input: newTask,
	handler: (input) => repo.createTask(getDb(), input),
	activity: (input, task: Task) =>
		activityEntry("task", task.id, fieldNames(input)),
});

export const createTasks = defineCommand({
	name: "tasks_create_many",
	description:
		"Create several tasks in one call. Each item is created independently and the response reports ok/error per item; a failing item does not cancel the others. Items are created in the given order, so task numbers are allocated sequentially. Each item needs its own project_id and title and accepts the same fields as tasks_create, including epic_id as a full epic id or a bare epic number resolved inside the item's project_id. Returns {items, succeeded, failed}; every item carries its index in the request list.",
	kind: "command",
	input: z.object({
		items: z.array(newTask).min(1).max(100),
	}),
	handler: (input) => summarize(repo.createTasksMany(getDb(), input.items)),
	activity: (input, result: { items: CreateBatchItem[] }) =>
		result.items.flatMap((item) =>
			item.ok
				? [
						activityEntry(
							"task",
							item.task.id,
							fieldNames(input.items[item.index]),
						),
					]
				: [],
		),
});

export const updateTask = defineCommand({
	name: "tasks_update",
	description:
		"Update fields of an existing task by id. Every field to change goes inside the patch object (e.g. {id: 'LOG-87', patch: {status: 'in-progress'}}); top-level fields other than id, patch and in_project are rejected. Id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82') resolved inside in_project, otherwise it must be unique across the whole backlog. In patch, epic_id accepts a full epic id (e.g. 'LOG-5') or a bare epic number (e.g. '5') resolved inside the task's current project.",
	kind: "command",
	input: z.object({
		id: z.string().min(1).describe(ID_DESCRIPTION),
		patch: taskPatch,
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ id, patch, in_project }) => {
		const result = repo.updateTaskDetailed(getDb(), id, patch, in_project);
		if (result.isErr()) {
			return err(result.error);
		}
		return ok({ ...result.value.task, changes: result.value.changes });
	},
	activity: (input, task: TaskWithChanges) =>
		activityEntry("task", task.id, fieldNames(input.patch), null, task.changes),
});

function summarize<T extends { ok: boolean }>(items: T[]) {
	const succeeded = items.filter((item) => item.ok).length;
	return { items, succeeded, failed: items.length - succeeded };
}

export const updateTasks = defineCommand({
	name: "tasks_update_many",
	description:
		"Update several tasks in one call. Each item is applied independently and the response reports ok/error per item; a failing item does not cancel the others. in_project scopes bare task numbers in every item.",
	kind: "command",
	input: z.object({
		items: z
			.array(z.object({ id: z.string().min(1), patch: taskPatch }))
			.min(1)
			.max(100),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ items, in_project }) =>
		summarize(repo.updateTasksMany(getDb(), items, in_project)),
	activity: (input, result: { items: BatchItem[] }) =>
		result.items.flatMap((item, index) =>
			item.ok
				? [
						activityEntry(
							"task",
							item.task.id,
							fieldNames(input.items[index].patch),
							null,
							item.changes,
						),
					]
				: [],
		),
});

export const closeTask = defineCommand({
	name: "tasks_close",
	description:
		"Close a task by id with a reason: 'fixed' → done, 'wontfix' | 'obsolete' | 'duplicate' | 'not-reproduced' → cancelled. 'not-reproduced' marks a report that could not be reproduced. Id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82') resolved inside in_project, otherwise it must be unique across the whole backlog.",
	kind: "command",
	input: z.object({
		id: z.string().min(1).describe(ID_DESCRIPTION),
		reason: z.enum(CLOSED_REASONS),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ id, reason, in_project }) => {
		const result = repo.closeTaskDetailed(getDb(), id, reason, in_project);
		if (result.isErr()) {
			return err(result.error);
		}
		return ok({ ...result.value.task, changes: result.value.changes });
	},
	activity: (_input, task: TaskWithChanges) =>
		activityEntry(
			"task",
			task.id,
			["status", "closed_reason"],
			null,
			task.changes,
		),
});

export const closeTasks = defineCommand({
	name: "tasks_close_many",
	description:
		"Close several tasks in one call. Each item is applied independently and the response reports ok/error per item; a failing item does not cancel the others. in_project scopes bare task numbers in every item.",
	kind: "command",
	input: z.object({
		items: z
			.array(
				z.object({ id: z.string().min(1), reason: z.enum(CLOSED_REASONS) }),
			)
			.min(1)
			.max(100),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ items, in_project }) =>
		summarize(repo.closeTasksMany(getDb(), items, in_project)),
	activity: (_input, result: { items: BatchItem[] }) =>
		result.items.flatMap((item) =>
			item.ok
				? [
						activityEntry(
							"task",
							item.task.id,
							["status", "closed_reason"],
							null,
							item.changes,
						),
					]
				: [],
		),
});

export const deleteTask = defineCommand({
	name: "tasks_delete",
	description:
		"Soft-delete a task by id. Id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82') resolved inside in_project, otherwise it must be unique across the whole backlog.",
	kind: "command",
	input: z.object({
		id: z.string().min(1).describe(ID_DESCRIPTION),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ id, in_project }) => repo.deleteTask(getDb(), id, in_project),
	activity: (_input, deletedId: string) =>
		activityEntry("task", deletedId, ["deleted_at"]),
});

export const moveTask = defineCommand({
	name: "tasks_move",
	description:
		"Move a task to another project: project_id is the destination project, in_project (optional) scopes the id lookup. Id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82') resolved inside in_project, otherwise it must be unique across the whole backlog.",
	kind: "command",
	input: z.object({
		id: z.string().min(1).describe(ID_DESCRIPTION),
		project_id: z
			.string()
			.min(1)
			.describe("Destination project id (e.g. 'eit')."),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ id, project_id, in_project }) =>
		repo.moveTask(getDb(), id, project_id, in_project),
	activity: (input, task: Task) =>
		activityEntry("task", task.id, ["project_id"], input.id),
});
