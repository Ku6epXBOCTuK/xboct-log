import { error } from "@sveltejs/kit";
import { command, query } from "$app/server";
import { z } from "zod";
import { getDb } from "../server/db";
import * as repo from "../server/tasks";
import { CLOSED_REASONS, PRIORITIES, STATUSES } from "../types";
import { unwrap } from "./result";

const taskFilters = z
	.object({
		project_id: z.string().min(1).optional(),
		status: z.array(z.enum(STATUSES)).optional(),
		priority: z.array(z.enum(PRIORITIES)).optional(),
		tag: z.array(z.string()).optional(),
		is_epic: z.boolean().optional(),
		epic_id: z.string().nullable().optional(),
		q: z.string().optional(),
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
	source_file: z.string().nullable().optional(),
	source_line: z.number().int().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

export const getTasks = query(taskFilters, (filters) =>
	repo.listTasks(getDb(), filters),
);

export const getTask = query(z.string().min(1), (id) => {
	const task = repo.getTask(getDb(), id);
	if (!task) {
		error(404, `task ${id} not found`);
	}
	return task;
});

export const createTask = command(newTask, (input) =>
	unwrap(repo.createTask(getDb(), input)),
);

export const updateTask = command(
	z.object({ id: z.string().min(1), patch: taskPatch }),
	({ id, patch }) => unwrap(repo.updateTask(getDb(), id, patch)),
);

export const closeTask = command(
	z.object({ id: z.string().min(1), reason: z.enum(CLOSED_REASONS) }),
	({ id, reason }) => unwrap(repo.closeTask(getDb(), id, reason)),
);

export const deleteTask = command(z.string().min(1), (id) =>
	unwrap(repo.deleteTask(getDb(), id)),
);

export const moveTask = command(
	z.object({ id: z.string().min(1), project_id: z.string().min(1) }),
	({ id, project_id }) => unwrap(repo.moveTask(getDb(), id, project_id)),
);
