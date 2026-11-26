import type { Comment } from "#lib/types.ts";
import { client, unwrap } from "#lib/api/system/client.ts";

export type CommentsPage = { items: Comment[]; total: number };

export async function listComments(input: {
	task_id: string;
}): Promise<CommentsPage> {
	return unwrap<CommentsPage>(
		await client.POST("/api/tasks_comments_list", { body: input }),
	);
}

export async function addComment(input: {
	task_id: string;
	body: string;
}): Promise<Comment> {
	return unwrap<Comment>(
		await client.POST("/api/tasks_comments_add", { body: input }),
	);
}

export async function editComment(input: {
	comment_id: string;
	body: string;
}): Promise<Comment> {
	return unwrap<Comment>(
		await client.POST("/api/tasks_comments_edit", { body: input }),
	);
}

export async function deleteComment(input: {
	comment_id: string;
}): Promise<Comment> {
	return unwrap<Comment>(
		await client.POST("/api/tasks_comments_delete", { body: input }),
	);
}
