import { error } from "@sveltejs/kit";
import { z } from "zod";
import { activityEntry } from "../server/activity";
import * as comments from "../server/comments";
import { getDb } from "../server/db";
import { resolveTaskId } from "../server/tasks";
import type { Comment } from "../types";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";
import { defineCommand, defineQuery } from "./define";
import { strictObject } from "./strict";

function resolveTask(db: ReturnType<typeof getDb>, taskId: string): string {
	const resolved = resolveTaskId(db, taskId);
	if (resolved.isErr()) {
		error(resolved.error.status, resolved.error.message);
	}
	return resolved.value;
}

export const listComments = defineQuery({
	name: "tasks_comments_list",
	description:
		"List the comments of a task, oldest first. Deleted comments are hidden. The task id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Returns { items, total }.",
	kind: "query",
	input: strictObject({
		task_id: taskIdSchema(ID_DESCRIPTION),
	}),
	handler: ({ task_id }) => {
		const db = getDb();
		const taskId = resolveTask(db, task_id);
		const items = comments.listComments(db, taskId);
		return { items, total: items.length };
	},
});

export const addComment = defineCommand({
	name: "tasks_comments_add",
	description:
		"Add a comment to a task. The task id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). Returns the created comment. Editing a comment later keeps its previous text as a revision.",
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
	description:
		"Edit the text of a comment by its id. The previous text is kept as a revision, so nothing is lost. Returns the updated comment with edited_at set.",
	kind: "command",
	input: strictObject({
		id: z.string().min(1).describe("Comment id."),
		body: z
			.string()
			.min(1)
			.describe(
				"New comment text for the human reader of the task: what changed and why, in a few sentences. No raw output, logs, file lists or details that go stale.",
			),
	}),
	handler: ({ id, body }) => comments.editComment(getDb(), id, body),
	activity: (_input, comment: Comment) =>
		activityEntry("task", comment.task_id, ["comments"]),
});

export const deleteComment = defineCommand({
	name: "tasks_comments_delete",
	description:
		"Soft-delete a comment by its id. The comment disappears from the task, but its id and history stay in the database. Returns the deleted comment.",
	kind: "command",
	input: strictObject({
		id: z.string().min(1).describe("Comment id."),
	}),
	handler: ({ id }) => comments.deleteComment(getDb(), id),
	activity: (_input, comment: Comment) =>
		activityEntry("task", comment.task_id, ["comments"]),
});
