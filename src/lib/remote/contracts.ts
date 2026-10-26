import { z } from "zod";
import {
	attachmentSchema,
	commentSchema,
	projectSchema,
	scopeSchema,
	taskSchema,
} from "../entities";
import { STATUSES } from "../types";

export const taskRef = taskSchema
	.pick({
		id: true,
		title: true,
		number: true,
		project_id: true,
		status: true,
		priority: true,
	})
	.loose();

export const taskListItem = taskSchema.partial().loose();

export const projectRef = projectSchema
	.pick({ id: true, name: true, prefix: true })
	.loose();

export const scopeRef = scopeSchema
	.pick({ id: true, project_id: true, name: true })
	.loose();

export const commentRef = commentSchema
	.pick({ id: true, task_id: true, body: true })
	.loose();

export const attachmentRef = attachmentSchema
	.pick({ id: true, task_id: true, file_name: true, size: true })
	.loose();

export const revisionRef = z.looseObject({
	id: z.number().int(),
	task_id: z.string(),
	field: z.string(),
	body: z.string(),
});

export const activityRef = z.looseObject({
	ts: z.string(),
	source: z.string(),
	op: z.string(),
	fields: z.array(z.string()),
});

export const tagRef = z.looseObject({
	tag: z.string(),
	count: z.number().int(),
	active: z.number().int(),
});

export const backupRef = z.looseObject({
	kind: z.string(),
	name: z.string(),
	path: z.string(),
	size: z.number().int(),
	mtime: z.string(),
});

export const taskCreated = z.looseObject({
	...taskRef.shape,
	warnings: z.array(z.string()),
});

export const taskList = z.looseObject({
	items: z.array(taskListItem),
	total: z.number().int(),
});

export const taskBoard = z.looseObject({
	columns: z.array(
		z.looseObject({
			status: z.enum(STATUSES),
			count: z.number().int(),
			items: z.array(taskListItem),
		}),
	),
	total: z.number().int(),
});

export const taskMany = z.looseObject({
	items: z.array(taskRef),
	missing: z.array(z.string()),
});

export const taskBatch = z.looseObject({
	items: z.array(
		z.looseObject({
			index: z.number().int(),
			id: z.string().nullable(),
			ok: z.boolean(),
		}),
	),
	succeeded: z.number().int(),
	failed: z.number().int(),
});

export const taskDeleted = z.looseObject({
	id: z.string(),
	deleted_at: z.string(),
});

export const projectList = z.looseObject({
	items: z.array(projectRef),
});

export const scopeList = z.looseObject({
	items: z.array(scopeRef),
});

export const scopeDeleteReport = z.looseObject({
	scope: scopeRef,
	task_ids: z.array(z.string()),
	epic_ids: z.array(z.string()),
	dry_run: z.boolean(),
});

export const commentList = z.looseObject({
	items: z.array(commentRef),
	total: z.number().int(),
});

export const attachmentList = z.looseObject({
	items: z.array(attachmentRef),
});

export const attachmentCreated = z.looseObject({
	item: attachmentRef,
});

export const attachmentDeleted = z.looseObject({
	id: z.string(),
});

export const attachmentVerify = z.looseObject({
	ok: z.array(attachmentRef),
	missing: z.array(attachmentRef),
});

export const backupCreated = z.looseObject({
	path: z.string(),
});

export const backupList = z.looseObject({
	items: z.array(backupRef),
});

export const activityList = z.looseObject({
	items: z.array(activityRef),
	total: z.number().int(),
});

export const activityLog = z.looseObject({
	items: z.array(activityRef),
	total: z.number().int(),
	ops: z.array(z.string()),
});

export const revisionList = z.looseObject({
	items: z.array(revisionRef),
	total: z.number().int(),
});

export const tagList = z.looseObject({
	items: z.array(tagRef),
	total: z.number().int(),
});

export const idList = z.looseObject({
	items: z.array(z.string()),
});
