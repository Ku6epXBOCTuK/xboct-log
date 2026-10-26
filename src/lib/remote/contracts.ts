import { z } from "zod";
import { PRIORITIES, STATUSES } from "../types";

export const taskRef = z.looseObject({
	id: z.string(),
	title: z.string(),
	number: z.number().int(),
	project_id: z.string(),
	status: z.enum(STATUSES),
	priority: z.enum(PRIORITIES),
});

export const projectRef = z.looseObject({
	id: z.string(),
	name: z.string(),
	prefix: z.string(),
});

export const scopeRef = z.looseObject({
	id: z.number().int(),
	project_id: z.string(),
	name: z.string(),
});

export const commentRef = z.looseObject({
	id: z.string(),
	task_id: z.string(),
	body: z.string(),
});

export const attachmentRef = z.looseObject({
	id: z.string(),
	task_id: z.string(),
	file_name: z.string(),
	size: z.number().int(),
});

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
	items: z.array(taskRef),
	total: z.number().int(),
});

export const taskBoard = z.looseObject({
	columns: z.array(
		z.looseObject({
			status: z.enum(STATUSES),
			count: z.number().int(),
			items: z.array(taskRef),
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

export const projectList = z.array(projectRef);

export const scopeList = z.array(scopeRef);

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

export const idList = z.array(z.string());
