import { error } from "@sveltejs/kit";
import { z } from "zod";
import { getDb } from "../server/db";
import * as repo from "../server/tasks";
import { CLOSED_REASONS, PRIORITIES, STATUSES } from "../types";
import { defineCommand, defineQuery } from "./define";

const taskFilters = z
	.object({
		project_id: z.string().min(1).optional(),
		status: z.array(z.enum(STATUSES)).optional(),
		priority: z.array(z.enum(PRIORITIES)).optional(),
		tag: z.array(z.string()).optional(),
		is_epic: z.boolean().optional(),
		epic_id: z.string().nullable().optional(),
		scope_id: z.number().int().nullable().optional(),
		q: z
			.string()
			.optional()
			.describe(
				"Поиск по фрагменту текста в заголовке, описании или ID задачи.",
			),
		title: z
			.string()
			.optional()
			.describe("Поиск по фрагменту заголовка задачи (регистронезависимо)."),
		title_exact: z
			.string()
			.optional()
			.describe("Точное совпадение заголовка задачи (регистронезависимо)."),
		fields: z
			.string()
			.optional()
			.describe(
				"Список полей через запятую для сокращения размера ответа (например id,number,title,status).",
			),
		include_project: z
			.boolean()
			.optional()
			.describe("Добавить к каждой задаче имя проекта (project_name)."),
		sort: z.enum(["updated_at", "created_at", "priority"]).optional(),
		order: z.enum(["asc", "desc"]).optional(),
		limit: z.number().int().positive().max(1000).optional(),
		offset: z.number().int().nonnegative().optional(),
	})
	.default({});

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
		"List tasks with filters (project, status, priority, tags, epic, scope, text query, title, title_exact), sorting and pagination. Use fields to limit returned columns and include_project to attach project names.",
	kind: "query",
	input: taskFilters,
	handler: (filters) => repo.listTasks(getDb(), filters),
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

export const findTasks = defineQuery({
	name: "tasks_find",
	description:
		"Find tasks by a fragment of their title. Returns id, number, title, status, project_id, updated_at — enough to locate a task ID without scanning the full list.",
	kind: "query",
	input: z.object({
		title: z
			.string()
			.min(1)
			.describe("Fragment of the task title to search for (case-insensitive)."),
		limit: z.number().int().positive().max(100).optional().default(20),
	}),
	handler: ({ title, limit }) =>
		repo.listTasks(getDb(), {
			title,
			fields: "id,number,title,status,project_id,updated_at",
			limit,
		}),
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
	description: "Close a task with a closed reason (done, wontfix, duplicate).",
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
