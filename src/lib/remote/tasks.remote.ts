import { error } from "@sveltejs/kit";
import { err, ok } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import { missingScopeWarning } from "../server/scopes";
import * as repo from "../server/tasks";
import type {
	BatchItem,
	CreateBatchItem,
	DeleteTaskOutcome,
	ReleasedLink,
} from "../server/tasks";
import {
	CLOSED_REASONS,
	PRIORITIES,
	STATUSES,
	type Task,
	type TaskWithChanges,
} from "../types";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";
import { defineCommand, defineQuery } from "./define";
import { strictObject } from "./strict";

const taskFilters = strictObject({
	project_id: z
		.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
		.optional()
		.describe(
			"Filter by project id (e.g. 'eit'). Accepts one id or a list of ids; a list matches tasks of any of them.",
		),
	exclude_project_id: z
		.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
		.optional()
		.describe(
			"Exclude projects: only tasks of other projects are returned. Accepts one id or a list of ids. Combine with project_id to get 'every project except X'.",
		),
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
		.optional()
		.describe(
			"Exact tag match, case-sensitive; no wildcards. Use q to match a partial tag.",
		),
	is_epic: z.boolean().optional(),
	epic_id: z
		.union([
			taskIdSchema("Epic id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-5')."),
			z.array(taskIdSchema("Epic id in the full 'PREFIX-NUMBER' form.")).min(1),
		])
		.nullable()
		.optional()
		.describe(
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
			"Case-insensitive substring search across title, description, id and tags. Tags match by substring: q='est:' finds tasks with a tag like 'est:L'. Use tag for a whole-tag match.",
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
	sort: z
		.enum(["updated_at", "created_at", "priority", "number", "title"])
		.optional()
		.describe(
			"Sort key. 'number' orders by the per-project task number (ascending by default), 'title' orders by title case-insensitively (ascending by default); 'updated_at' and 'created_at' default to descending, 'priority' to ascending.",
		),
	order: z
		.enum(["asc", "desc"])
		.optional()
		.describe(
			"Sort direction. Defaults to asc for priority, number and title, desc for the date keys.",
		),
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
}).default({ limit: 100 });

const EPIC_ID_DESCRIPTION =
	"Epic id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-5'). A bare epic number (e.g. '5') is rejected: the epic must belong to the same project as the task.";

const newTask = strictObject({
	project_id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	status: z.enum(STATUSES).optional(),
	priority: z.enum(PRIORITIES).optional(),
	is_epic: z.boolean().optional(),
	epic_id: taskIdSchema(EPIC_ID_DESCRIPTION).nullable().optional(),
	scope_id: z
		.number()
		.int()
		.nullable()
		.optional()
		.describe(
			"Scope id; it must belong to the same project as the task. List the scopes of a project with scopes_list {project_id}.",
		),
	source_file: z.string().nullable().optional(),
	source_line: z.number().int().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

const taskPatch = strictObject({
	title: z.string().min(1).optional(),
	description: z.string().optional(),
	status: z.enum(STATUSES).optional(),
	priority: z.enum(PRIORITIES).optional(),
	is_epic: z.boolean().optional(),
	epic_id: taskIdSchema(EPIC_ID_DESCRIPTION).nullable().optional(),
	scope_id: z
		.number()
		.int()
		.nullable()
		.optional()
		.describe(
			"Scope id; it must belong to the same project as the task. null clears the scope.",
		),
	source_file: z.string().nullable().optional(),
	source_line: z.number().int().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

export const getTasks = defineQuery({
	name: "tasks_list",
	description:
		"List tasks with filters (project, status, priority, tags, epic, scope, blocked_by, blocks, text query, title, title_exact), sorting and pagination. Use q to locate a task by id, title, description or a partial tag (e.g. q='LOG-4', q='est:'). Returns {items, total} where total is the count of all matching tasks before limit/offset. limit defaults to 100 (max 1000); use offset and total to paginate. Use fields to limit returned columns. By default each task carries short_description (first line, ~120 chars) instead of the full description; set include_description to get the full text. include_project attaches project names, include_scope attaches scope names, and neither filters; project_archived filters by project archival; include_deleted also returns soft-deleted tasks (hidden by default). Task id is the full 'PREFIX-NUMBER' identifier (e.g. 'LOG-82'); number is the per-project sequence number (e.g. 82), unique only inside its project. project_id accepts one id or a list of ids; exclude_project_id drops the given projects (use it for 'every project except X'). The epic filter accepts a full epic id (e.g. 'LOG-5') or a list of them; scope_id likewise takes one scope id or a list, and null matches tasks without that link. has_epic and has_scope filter by the presence of an epic or a scope. sort accepts updated_at, created_at, priority, number and title. The blocked_by filter returns tasks whose blocked_by list contains the given task, the blocks filter returns tasks whose blocks list contains the given task. Every task carries blocked_by (tasks that block me) and blocks (tasks I block) as id lists.",
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
		"Get multiple tasks by their IDs in a single call. Each id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'); a bare number is rejected because it is unique only inside a project. Returns { items, missing }: items follow the requested order, missing lists ids that do not exist, are soft-deleted or malformed. Use this instead of calling tasks_get in a loop.",
	kind: "query",
	input: strictObject({
		ids: z
			.array(taskIdSchema("Full task id, e.g. 'LOG-82'."))
			.min(1)
			.max(100)
			.describe("List of task IDs to fetch."),
	}),
	handler: ({ ids }) => repo.getTasksByIds(getDb(), ids),
});

export const getTask = defineQuery({
	name: "tasks_get",
	description:
		"Get a single task by id. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'); a bare number is rejected because it is unique only inside a project.",
	kind: "query",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ id }) => {
		const db = getDb();
		const resolved = repo.resolveTaskId(db, id);
		if (resolved.isErr()) {
			error(resolved.error.status, resolved.error.message);
		}
		return repo.getTask(db, resolved.value)!;
	},
});

export const createTask = defineCommand({
	name: "tasks_create",
	description:
		"Create a task. Requires project_id and title; status, priority, epic, scope, tags are optional. epic_id accepts a full epic id (e.g. 'LOG-5') of the same project. Projects that define scopes expect every task to carry one: the result carries a warnings array, and a warning naming the available scopes appears when the task is created without a scope.",
	kind: "command",
	input: newTask,
	handler: (input) => {
		const db = getDb();
		const result = repo.createTask(db, input);
		if (result.isErr()) {
			return err(result.error);
		}
		return ok({
			...result.value,
			warnings: warningsFor(db, result.value),
		});
	},
	activity: (input, task: Task) =>
		activityEntry("task", task.id, fieldNames(input)),
});

export const createTasks = defineCommand({
	name: "tasks_create_many",
	description:
		"Create several tasks in one call. Each item is created independently and the response reports ok/error per item; a failing item does not cancel the others. Items are created in the given order, so task numbers are allocated sequentially. Each item needs its own project_id and title and accepts the same fields as tasks_create, including epic_id as a full epic id of the item's project. Returns {items, succeeded, failed}; every item carries its index in the request list and its own warnings array, which is not empty when the item was created without a scope in a project that defines scopes.",
	kind: "command",
	input: strictObject({
		items: z.array(newTask).min(1).max(100),
	}),
	handler: (input) => {
		const db = getDb();
		const items = repo.createTasksMany(db, input.items);
		return {
			...summarize(items),
			items: items.map((item) =>
				item.ok ? { ...item, warnings: warningsFor(db, item.task) } : item,
			),
		};
	},
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
		"Update fields of an existing task by id. Every field to change goes inside the patch object (e.g. {id: 'LOG-87', patch: {status: 'in-progress'}}); top-level fields other than id and patch are rejected. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). In patch, epic_id accepts a full epic id (e.g. 'LOG-5') of the task's current project. The result carries a warnings array, which is not empty when the task has no scope while its project defines scopes.",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
		patch: taskPatch,
	}),
	handler: ({ id, patch }) => {
		const db = getDb();
		const result = repo.updateTaskDetailed(db, id, patch);
		if (result.isErr()) {
			return err(result.error);
		}
		return ok({
			...result.value.task,
			changes: result.value.changes,
			warnings: warningsFor(db, result.value.task),
		});
	},
	activity: (input, task: TaskWithChanges) =>
		activityEntry("task", task.id, fieldNames(input.patch), null, task.changes),
});

function summarize<T extends { ok: boolean }>(items: T[]) {
	const succeeded = items.filter((item) => item.ok).length;
	return { items, succeeded, failed: items.length - succeeded };
}

function warningsFor(db: DatabaseSync, task: Task): string[] {
	const warning = missingScopeWarning(db, task.project_id, task.scope_id);
	return warning ? [warning] : [];
}

export const updateTasks = defineCommand({
	name: "tasks_update_many",
	description:
		"Update several tasks in one call. Each item is applied independently and the response reports ok/error per item; a failing item does not cancel the others. Every id must use the full 'PREFIX-NUMBER' form. Every successful item carries its own warnings array, which is not empty when the task has no scope while its project defines scopes.",
	kind: "command",
	input: strictObject({
		items: z
			.array(
				strictObject({
					id: taskIdSchema("Full task id, e.g. 'LOG-82'."),
					patch: taskPatch,
				}),
			)
			.min(1)
			.max(100),
	}),
	handler: ({ items }) => {
		const db = getDb();
		const result = repo.updateTasksMany(db, items);
		return {
			...summarize(result),
			items: result.map((item) =>
				item.ok ? { ...item, warnings: warningsFor(db, item.task) } : item,
			),
		};
	},
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
		"Close a task by id with a reason: 'fixed' → done, 'wontfix' | 'obsolete' | 'duplicate' | 'not-reproduced' → cancelled. 'not-reproduced' marks a report that could not be reproduced. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Closing a task that blocks others releases them from status 'blocked' - those tasks are listed in released.",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
		reason: z.enum(CLOSED_REASONS),
	}),
	handler: ({ id, reason }) => {
		const result = repo.closeTaskDetailed(getDb(), id, reason);
		if (result.isErr()) {
			return err(result.error);
		}
		return ok({
			...result.value.task,
			changes: result.value.changes,
			released: result.value.released ?? [],
		});
	},
	activity: (_input, task: TaskWithChanges & { released?: ReleasedLink[] }) => [
		activityEntry(
			"task",
			task.id,
			["status", "closed_reason"],
			null,
			task.changes,
		),
		...(task.released ?? []).map((link) =>
			activityEntry(
				"task",
				link.task_id,
				link.changes.map((change) => change.field),
				null,
				link.changes,
			),
		),
	],
});

export const closeTasks = defineCommand({
	name: "tasks_close_many",
	description:
		"Close several tasks in one call. Each item is applied independently and the response reports ok/error per item; a failing item does not cancel the others. Every id must use the full 'PREFIX-NUMBER' form.",
	kind: "command",
	input: strictObject({
		items: z
			.array(
				strictObject({
					id: taskIdSchema("Full task id, e.g. 'LOG-82'."),
					reason: z.enum(CLOSED_REASONS),
				}),
			)
			.min(1)
			.max(100),
	}),
	handler: ({ items }) => summarize(repo.closeTasksMany(getDb(), items)),
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
						...(item.released ?? []).map((link) =>
							activityEntry(
								"task",
								link.task_id,
								link.changes.map((change) => change.field),
								null,
								link.changes,
							),
						),
					]
				: [],
		),
});

export const deleteTask = defineCommand({
	name: "tasks_delete",
	description:
		"Soft-delete a task by id. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Deleting drops the blocker links of the task and detaches it from its epic, so the affected tasks change as well - they are listed in released. Returns {id, deleted_at, changes, released}.",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ id }) => {
		const result = repo.deleteTaskDetailed(getDb(), id);
		if (result.isErr()) {
			return err(result.error);
		}
		return ok(result.value);
	},
	activity: (_input, result: DeleteTaskOutcome) => [
		activityEntry("task", result.id, ["deleted_at"], null, result.changes),
		...result.released.map((link) =>
			activityEntry(
				"task",
				link.task_id,
				link.changes.map((change) => change.field),
				null,
				link.changes,
			),
		),
	],
});

export const restoreTask = defineCommand({
	name: "tasks_restore",
	description:
		"Restore a soft-deleted task by id: clears deleted_at and the task is back on the board. Find deleted tasks with tasks_list(include_deleted: true). The task id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Deleting detaches a task from its epic and drops its blocker links — restoring does not bring those back, set them again with tasks_update. Returns the restored task.",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ id }) => repo.restoreTask(getDb(), id),
	activity: (_input, task: Task) =>
		activityEntry("task", task.id, ["deleted_at"]),
});

export const moveTask = defineCommand({
	name: "tasks_move",
	description:
		"Move a task to another project: project_id is the destination project. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82').",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
		project_id: z
			.string()
			.min(1)
			.describe("Destination project id (e.g. 'eit')."),
	}),
	handler: ({ id, project_id }) => repo.moveTask(getDb(), id, project_id),
	activity: (input, task: Task) =>
		activityEntry("task", task.id, ["project_id"], input.id),
});
