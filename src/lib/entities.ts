import { z } from "zod";
import { CLOSED_REASONS, ESTIMATES, PRIORITIES, STATUSES } from "./types.ts";

export const projectSchema = z.object({
	id: z.string(),
	name: z.string(),
	prefix: z.string(),
	repo: z.string().nullable(),
	created_at: z.string(),
	archived_at: z.string().nullable(),
	task_counts: z.record(z.string(), z.number()).optional(),
	epic_counts: z.record(z.string(), z.number()).optional(),
});

export const scopeSchema = z.object({
	id: z.number(),
	project_id: z.string(),
	name: z.string(),
	created_at: z.string(),
	task_count: z.number().optional(),
	tasks_total: z.number().optional(),
	epics_count: z.number().optional(),
});

export const commentSchema = z.object({
	id: z.string(),
	task_id: z.string(),
	body: z.string(),
	created_at: z.string(),
	edited_at: z.string().nullable(),
	deleted_at: z.string().nullable(),
});

export const attachmentSchema = z.object({
	id: z.string(),
	task_id: z.string(),
	file_name: z.string(),
	mime_type: z.string().nullable(),
	size: z.number(),
	created_at: z.string(),
	missing: z.boolean(),
});

export const taskSchema = z.object({
	id: z.string(),
	project_id: z.string(),
	number: z.number(),
	title: z.string(),
	description: z.string(),
	status: z.enum(STATUSES),
	priority: z.enum(PRIORITIES),
	is_epic: z.boolean(),
	epic_id: z.string().nullable(),
	scope_id: z.number().nullable(),
	source_file: z.string().nullable(),
	tags: z.array(z.string()),
	estimate: z.enum(ESTIMATES).nullable(),
	assignee: z.string().nullable(),
	due_at: z.string().nullable(),
	attachments_count: z.number().optional(),
	created_at: z.string(),
	updated_at: z.string(),
	closed_at: z.string().nullable(),
	closed_reason: z.enum(CLOSED_REASONS).nullable(),
	blocked_reason: z.string().nullable(),
	deleted_at: z.string().nullable(),
	project_name: z.string().optional(),
	scope_name: z.string().optional(),
	short_description: z.string().optional(),
	blocked_by: z.array(z.string()).optional(),
	blocks: z.array(z.string()).optional(),
	relates_to: z.array(z.string()).optional(),
	duplicates: z.array(z.string()).optional(),
	duplicated_by: z.array(z.string()).optional(),
	children_counts: z.record(z.string(), z.number()).optional(),
});
