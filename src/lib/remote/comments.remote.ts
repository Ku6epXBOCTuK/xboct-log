import { error } from "@sveltejs/kit";
import { z } from "zod";
import { activityEntry } from "../server/activity";
import * as comments from "../server/comments";
import { getDb } from "../server/db";
import { resolveTaskId } from "../server/tasks";
import type { Comment } from "../types";
import { ID_DESCRIPTION, IN_PROJECT_DESCRIPTION } from "#lib/tasks/ids.ts";
import { defineCommand, defineQuery } from "./define";
import { strictObject } from "./strict";

function resolveTask(
	db: ReturnType<typeof getDb>,
	taskId: string,
	inProject?: string,
): string {
	const resolved = resolveTaskId(db, taskId, inProject);
	if (resolved.isErr()) {
		error(resolved.error.status, resolved.error.message);
	}
	return resolved.value;
}

export const listComments = defineQuery({
	name: "tasks_comments_list",
	description:
		"List the comments of a task, oldest first. Deleted comments are hidden. The task id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82') resolved inside in_project, otherwise it must be unique across the whole backlog. Returns { items, total }.",
	kind: "query",
	input: strictObject({
		task_id: z.string().min(1).describe(ID_DESCRIPTION),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ task_id, in_project }) => {
		const db = getDb();
		const taskId = resolveTask(db, task_id, in_project);
		const items = comments.listComments(db, taskId);
		return { items, total: items.length };
	},
});

export const addComment = defineCommand({
	name: "tasks_comments_add",
	description:
		"Add a comment to a task. The task id accepts the full 'PREFIX-NUMBER' form (e.g. 'LOG-82') or a bare task number (e.g. '82') resolved inside in_project, otherwise it must be unique across the whole backlog. Returns the created comment. Editing a comment later keeps its previous text as a revision.",
	kind: "command",
	input: strictObject({
		task_id: z.string().min(1).describe(ID_DESCRIPTION),
		body: z.string().min(1),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ task_id, body, in_project }) =>
		comments.addComment(getDb(), { task_id, body, in_project }),
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
		body: z.string().min(1),
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
