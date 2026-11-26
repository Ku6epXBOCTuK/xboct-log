import type { Task, TaskWithChanges } from "#lib/types.ts";
import { client, unwrap } from "#lib/api/system/client.ts";

export async function addBlocker(input: {
	task_id: string;
	blocked_by: string;
}): Promise<TaskWithChanges> {
	return unwrap<TaskWithChanges>(
		await client.POST("/api/tasks_add_blocker", { body: input }),
	);
}

export async function removeBlocker(input: {
	task_id: string;
	blocked_by: string;
}): Promise<TaskWithChanges> {
	return unwrap<TaskWithChanges>(
		await client.POST("/api/tasks_remove_blocker", { body: input }),
	);
}

export type LinkType = "relates_to" | "duplicates";

export async function addLink(input: {
	task_id: string;
	link_type: LinkType;
	target: string;
}): Promise<TaskWithChanges> {
	return unwrap<TaskWithChanges>(
		await client.POST("/api/tasks_add_link", { body: input }),
	);
}

export async function removeLink(input: {
	task_id: string;
	link_type: LinkType;
	target: string;
}): Promise<TaskWithChanges> {
	return unwrap<TaskWithChanges>(
		await client.POST("/api/tasks_remove_link", { body: input }),
	);
}

export type LinkedTask = Task;
