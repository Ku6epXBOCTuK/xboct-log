import { z } from "zod";
import { activityEntry } from "../server/activity";
import * as comments from "../server/comments";
import { getDb } from "../server/db";
import type { Comment } from "../types";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";
import { commentList, commentRef } from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { COMMENT_FIELDS } from "./shape";
import { strictObject } from "./strict";

export const listComments = defineQuery({
	name: "tasks_comments_list",
	output: commentList,
	description:
		"List the comments of a task, oldest first. Deleted comments are hidden. The task id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Returns: {items, total} - every item is a comment - " +
		COMMENT_FIELDS +
		".",
	kind: "query",
	input: strictObject({
		task_id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ task_id }) => {
		const db = getDb();
		const taskId = resolveTaskOrThrow(db, task_id);
		const items = comments.listComments(db, taskId);
		return { items, total: items.length };
	},
});

export const addComment = defineCommand({
	name: "tasks_comments_add",
	output: commentRef,
	description:
		"Add a comment to a task. The task id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Returns: the created comment - " +
		COMMENT_FIELDS +
		". Editing a comment later keeps its previous text as a revision.",
	kind: "command",
	input: strictObject({
		task_id: taskIdSchema(ID_DESCRIPTION),
		body: z
			.string()
			.min(1)
			.describe(
				"Comment text for the human reader of the task: what changed and why, in a few sentences. No raw output, logs, file lists or details that go stale; keep only what is needed to follow the task.",
			),
	}),
	handler: ({ task_id, body }) =>
		comments.addComment(getDb(), { task_id, body }),
	activity: (_input, comment: Comment) =>
		activityEntry("task", comment.task_id, ["comments"]),
});

export const editComment = defineCommand({
	name: "tasks_comments_edit",
	output: commentRef,
	description:
		"Edit the text of a comment by comment_id, the `id` field of an item from tasks_comments_list. The previous text is kept as a revision, so nothing is lost. Returns: the updated comment - " +
		COMMENT_FIELDS +
		" with edited_at set.",
	kind: "command",
	input: strictObject({
		comment_id: z
			.string()
			.min(1)
			.describe("The `id` of a comment from tasks_comments_list."),
		body: z
			.string()
			.min(1)
			.describe(
				"New comment text for the human reader of the task: what changed and why, in a few sentences. No raw output, logs, file lists or details that go stale.",
			),
	}),
	handler: ({ comment_id, body }) =>
		comments.editComment(getDb(), comment_id, body),
	activity: (_input, comment: Comment) =>
		activityEntry("task", comment.task_id, ["comments"]),
});

export const deleteComment = defineCommand({
	name: "tasks_comments_delete",
	output: commentRef,
	description:
		"Soft-delete a comment by comment_id, the `id` field of an item from tasks_comments_list. The comment disappears from the task, but its id and history stay in the database. Returns: the deleted comment - " +
		COMMENT_FIELDS +
		" with deleted_at set.",
	kind: "command",
	input: strictObject({
		comment_id: z
			.string()
			.min(1)
			.describe("The `id` of a comment from tasks_comments_list."),
	}),
	handler: ({ comment_id }) => comments.deleteComment(getDb(), comment_id),
	activity: (_input, comment: Comment) =>
		activityEntry("task", comment.task_id, ["comments"]),
});
