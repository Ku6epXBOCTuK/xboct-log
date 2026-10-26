import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";
import { err, ok } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
	activityEntry,
	creationFields,
	fieldNames,
	type ActivityEntry,
} from "../server/activity";
import { getDb } from "../server/db";
import { missingScopeWarning } from "../server/scopes";
import type {
	BatchItem,
	CreateBatchItem,
	DeleteTaskOutcome,
	ReleasedLink,
} from "../server/tasks";
import * as repo from "../server/tasks";
import {
	BLOCKED_REASON_MAX_LENGTH,
	CLOSED_REASONS,
	ESTIMATES,
	PRIORITIES,
	STATUSES,
	type Task,
	type TaskWithChanges,
} from "../types";
import {
	taskBatch,
	taskCreated,
	taskDeleted,
	taskList,
	taskMany,
	taskRef,
} from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { TASK_FIELDS } from "./shape";
import { strictObject } from "./strict";
import { taskFilters } from "./tasks.filters";

const EPIC_ID_DESCRIPTION =
	"Epic id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-5'). A bare epic number (e.g. '5') is rejected: the epic must belong to the same project as the task. Epics are flat: only a non-epic task carries epic_id, and an epic with epic_id is rejected, so nested epics do not exist.";

const BLOCKED_REASON_DESCRIPTION =
	"Why the task is blocked, one line of free text. Use it when the blocker is outside the tracker (waiting for a release, an answer, an access). Only allowed on a task with status 'blocked'; null clears it.";

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
			"Scope id; it must belong to the same project as the task. List the scopes of a project with scopes_list {project_id}, create one with scopes_create {project_id, name}.",
		),
	source_file: z
		.string()
		.nullable()
		.optional()
		.describe(
			"File or document the task came from; provenance only, never verified, several tasks may share it.",
		),
	tags: z.array(z.string()).optional(),
	estimate: z
		.enum(ESTIMATES)
		.nullable()
		.optional()
		.describe(
			"Size of the task: 'S', 'M' or 'L'. null leaves the task without an estimate.",
		),
	assignee: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Person responsible for the task, a free-form name. null leaves the task unassigned.",
		),
	due_at: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Due date of the task as YYYY-MM-DD; a full ISO timestamp is accepted and cut to the day. null leaves the task without a due date.",
		),
	blocked_reason: z
		.string()
		.max(BLOCKED_REASON_MAX_LENGTH)
		.nullable()
		.optional()
		.describe(BLOCKED_REASON_DESCRIPTION),
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
	source_file: z
		.string()
		.nullable()
		.optional()
		.describe(
			"File or document the task came from; provenance only, never verified, several tasks may share it.",
		),
	tags: z.array(z.string()).optional(),
	estimate: z
		.enum(ESTIMATES)
		.nullable()
		.optional()
		.describe("Size of the task: 'S', 'M' or 'L'. null clears the estimate."),
	assignee: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Person responsible for the task, a free-form name. null clears the assignee.",
		),
	due_at: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Due date of the task as YYYY-MM-DD; a full ISO timestamp is accepted and cut to the day. null clears the due date.",
		),
	blocked_reason: z
		.string()
		.max(BLOCKED_REASON_MAX_LENGTH)
		.nullable()
		.optional()
		.describe(BLOCKED_REASON_DESCRIPTION),
});

export const getTasks = defineQuery({
	name: "tasks_list",
	output: taskList,
	description:
		"List tasks with filters (project, status, priority, estimate, assignee, due date, tags, epic, scope, blocked_by, blocks, text query, title, title_exact, source_file), sorting and pagination. Use q to locate a task by id, title, description, the id of its epic or a partial tag (e.g. q='LOG-4', q='26', q='est:'). Returns: {items, total} - items is the list of matching tasks, total is the count of all matching tasks before limit/offset. limit defaults to 100 (max 1000); use offset and total to paginate. Use fields to limit returned columns; the field names it accepts are listed in the description of the fields parameter, unknown names are ignored, and id, project_id and number always stay in the result. By default each task carries short_description (first line, ~120 chars) instead of the full description; set include_description to get the full text, in which case short_description is omitted. include_project attaches project names, include_scope attaches scope names, and neither filters; project_archived filters by project archival; include_deleted also returns soft-deleted tasks (hidden by default). Task id is the full 'PREFIX-NUMBER' identifier (e.g. 'LOG-82'); number is the per-project sequence number (e.g. 82), unique only inside its project. project_id accepts one id or a list of ids; exclude_project_id drops the given projects (use it for 'every project except X'). The epic filter accepts a full epic id (e.g. 'LOG-5') or a list of them; scope_id likewise takes one scope id or a list, and null matches tasks without that link. has_epic and has_scope filter by the presence of an epic or a scope. The estimate filter takes one size or a list of them ('S', 'M', 'L'); tasks without an estimate are not matched. The assignee filter takes one name or a list of them and matches case-insensitively; tasks without an assignee are not matched. The due_before and due_after filters take a date (YYYY-MM-DD) and select the tasks due before it or on and after it; tasks without a due date are not matched, so the two together give a due window. sort accepts updated_at, created_at, closed_at, priority, number and title. The blocked_by filter returns tasks whose blocked_by list contains the given task, the blocks filter returns tasks whose blocks list contains the given task. The source_file filter matches the source file path of a task partially and case-insensitively, so a fragment such as 'backlog' selects every task imported from that file. Every task carries blocked_by (tasks that block me) and blocks (tasks I block) as id lists.",
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

export const listDeletedTasks = defineQuery({
	name: "tasks_deleted_list",
	output: taskList,
	description:
		"List the soft-deleted tasks of the backlog: the ones that were deleted and are still recoverable. Returns: {items, total}, newest first. A deleted task keeps its id, number, title, description and tags, but it is missing from every other task list; restore it with tasks_restore. Supports the project_id and q filters and pagination via limit and offset.",
	kind: "query",
	input: strictObject({
		project_id: z
			.string()
			.min(1)
			.optional()
			.describe("Project id: keeps only the deleted tasks of that project."),
		q: z
			.string()
			.min(1)
			.optional()
			.describe("Text to search in the id, the title and the description."),
		limit: z
			.number()
			.int()
			.positive()
			.max(200)
			.optional()
			.describe("Maximum number of tasks to return (default 50, max 200)."),
		offset: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Number of tasks to skip, for pagination."),
	}),
	handler: ({ project_id, q, limit, offset }) => {
		const db = getDb();
		const query = {
			project_id,
			q,
			deleted_only: true,
			limit: limit ?? 50,
			offset,
		};
		return {
			items: repo.listTasks(db, query),
			total: repo.countTasks(db, query),
		};
	},
});

export const getTasksByIds = defineQuery({
	name: "tasks_get_many",
	output: taskMany,
	description:
		"Get multiple tasks by their IDs in a single call. Each id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'); a bare number is rejected because it is unique only inside a project. Returns: {items, missing} - items follow the requested order and carry the task fields, missing lists ids that do not exist, are soft-deleted or malformed. Use this instead of calling tasks_get in a loop.",
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
	output: taskRef,
	description:
		"Get a single task by id. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'); a bare number is rejected because it is unique only inside a project. Returns: the task itself - " +
		TASK_FIELDS +
		". For a task with is_epic=true the result also carries children_counts: the number of its child tasks per status (backlog, open, in-progress, blocked, done, cancelled) plus their total.",
	kind: "query",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ id }) => {
		const db = getDb();
		const task = repo.getTask(db, resolveTaskOrThrow(db, id))!;
		if (!task.is_epic) {
			return task;
		}
		return {
			...task,
			children_counts: repo.countEpicChildrenByStatus(db, task.id),
		};
	},
});

export const createTask = defineCommand({
	name: "tasks_create",
	output: taskCreated,
	description:
		"Create a task. Requires project_id and title; status, priority, estimate, assignee, due_at, blocked_reason, epic, scope, tags are optional. status defaults to 'backlog'; move the task to 'open' when it is committed to be done. estimate is the size of the task: 'S', 'M' or 'L'. assignee is the person responsible for the task, due_at is its due date (YYYY-MM-DD). blocked_reason is one line of free text explaining a block outside the tracker and is only allowed when status is 'blocked'. epic_id accepts a full epic id (e.g. 'LOG-5') of the same project. Projects that define scopes expect every task to carry one: the result carries a warnings array, and a warning naming the available scopes appears when the task is created without a scope. A project without scopes can get one with scopes_create {project_id, name}. source_file names the document or file the task came from; it is provenance only, it is never verified and several tasks may share it. Returns: the created task - " +
		TASK_FIELDS +
		" with a warnings array.",
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
		activityEntry("task", task.id, creationFields(input)),
});

export const createTasks = defineCommand({
	name: "tasks_create_many",
	output: taskBatch,
	description:
		"Create several tasks in one call. Each item is created independently and the response reports ok/error per item; a failing item does not cancel the others. Items are created in the given order, so task numbers are allocated sequentially. Each item needs its own project_id and title and accepts the same fields as tasks_create, including epic_id as a full epic id of the item's project. Returns: {items, succeeded, failed} - every item is {index, id, ok, task, changes, released, warnings} when it worked and {index, id, ok:false, error:{kind, message}} when it failed, where index is the position in the request list and id is the id of the created task (null for a failed item). changes is empty for a created task, released is empty when nothing was released. Every item carries its own warnings array, which is not empty when the item was created without a scope in a project that defines scopes.",
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
							creationFields(input.items[item.index]),
						),
					]
				: [],
		),
});

export const updateTask = defineCommand({
	name: "tasks_update",
	output: taskRef,
	description:
		"Update fields of an existing task by id. Every field to change goes inside the patch object (e.g. {id: 'LOG-87', patch: {status: 'in-progress'}}); top-level fields other than id and patch are rejected. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). In patch, epic_id accepts a full epic id (e.g. 'LOG-5') of the task's current project, estimate takes the size of the task ('S', 'M' or 'L') or null to clear it, assignee takes the name of the responsible person or null to clear it, due_at takes the due date (YYYY-MM-DD) or null to clear it, and blocked_reason is one line of free text explaining a block outside the tracker, allowed only on a blocked task; leaving status 'blocked' clears it. The patch must name at least one field with a value: an empty patch, a field set to undefined, an unknown field or an epic id that does not exist is an error, the task is left untouched. Returns: the updated task - " +
		TASK_FIELDS +
		" with a changes array and a warnings array, which is not empty when the task has no scope while its project defines scopes, or when the task is blocked with neither a blocker task nor a blocked_reason.",
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
	const warnings: string[] = [];
	const scopeWarning = missingScopeWarning(db, task.project_id, task.scope_id);
	if (scopeWarning) {
		warnings.push(scopeWarning);
	}
	if (
		task.status === "blocked" &&
		(task.blocked_by ?? []).length === 0 &&
		(task.blocked_reason ?? null) === null
	) {
		warnings.push(
			"task is blocked with no blocker task and no blocked_reason: say what or who it waits for, or add a blocker",
		);
	}
	return warnings;
}

function releasedEntries(released: ReleasedLink[]): ActivityEntry[] {
	return released.map((link) =>
		activityEntry(
			"task",
			link.task_id,
			link.changes.map((change) => change.field),
			null,
			link.changes,
		),
	);
}

export const updateTasks = defineCommand({
	name: "tasks_update_many",
	output: taskBatch,
	description:
		"Update several tasks in one call. Each item is applied independently and the response reports ok/error per item; a failing item does not cancel the others. Every id must use the full 'PREFIX-NUMBER' form. Every patch must name at least one field with a value: an empty patch, a field set to undefined, an unknown field or an epic id that does not exist is an error for that item, the task is left untouched and the item reports ok:false. Returns: {items, succeeded, failed} - every item is {index, id, ok, task, changes, released, warnings} when it worked and {index, id, ok:false, error:{kind, message}} when it failed, where index is the position in the request list and id is the id of the task. released is empty when nothing was released. Every successful item carries its own warnings array, which is not empty when the task has no scope while its project defines scopes.",
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
	output: taskRef,
	description:
		"Close a task by id with a reason: 'fixed' → done, 'wontfix' | 'obsolete' | 'duplicate' | 'not-reproduced' → cancelled. 'not-reproduced' marks a report that could not be reproduced. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Closing a task that blocks others releases them from status 'blocked' - every released task returns to the status it had before it was blocked ('open' when that status is unknown), and those tasks are listed in released. Returns: the closed task - " +
		TASK_FIELDS +
		" with a changes array and a released array.",
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
		...releasedEntries(task.released ?? []),
	],
});

export const closeTasks = defineCommand({
	name: "tasks_close_many",
	output: taskBatch,
	description:
		"Close several tasks in one call. Each item is applied independently and the response reports ok/error per item; a failing item does not cancel the others. Every id must use the full 'PREFIX-NUMBER' form. Returns: {items, succeeded, failed} - every item is {index, id, ok, task, changes, released, warnings} when it worked and {index, id, ok:false, error:{kind, message}} when it failed, where index is the position in the request list and id is the id of the task.",
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
	handler: ({ items }) => {
		const db = getDb();
		const result = repo.closeTasksMany(db, items);
		return {
			...summarize(result),
			items: result.map((item) =>
				item.ok ? { ...item, warnings: warningsFor(db, item.task) } : item,
			),
		};
	},
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
						...releasedEntries(item.released ?? []),
					]
				: [],
		),
});

export const deleteTask = defineCommand({
	name: "tasks_delete",
	output: taskDeleted,
	description:
		"Soft-delete a task by id. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Deleting drops the blocker links of the task and detaches it from its epic, so the affected tasks change as well - they are listed in released. Returns: {id, deleted_at, changes, released}.",
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
		...releasedEntries(result.released),
	],
});

export const restoreTask = defineCommand({
	name: "tasks_restore",
	output: taskRef,
	description:
		"Restore a soft-deleted task by id: clears deleted_at and the task is back on the board. Find deleted tasks with tasks_list(include_deleted: true). The task id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Deleting detaches a task from its epic and drops its blocker links — restoring does not bring those back, set them again with tasks_update. Returns: the restored task - " +
		TASK_FIELDS,
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
	output: taskRef,
	description:
		"Move a task to another project: project_id is the destination project. The id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Returns: the moved task - " +
		TASK_FIELDS,
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
