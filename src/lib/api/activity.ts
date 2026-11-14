import type { ActivityItem, ActivityLogItem } from "#lib/types.ts";
import { client, unwrap } from "./client.ts";

export type TaskHistoryPage = { items: ActivityItem[]; total: number };

export async function getTaskHistory(input: {
	task_id: string;
	limit?: number;
}): Promise<TaskHistoryPage> {
	return unwrap<TaskHistoryPage>(
		await client.POST("/api/tasks_history", { body: input }),
	);
}

export type ActivityLogPage = {
	items: ActivityLogItem[];
	total: number;
	ops: string[];
};

export async function listActivityLog(
	input: {
		source?: "ui" | "mcp" | "cli";
		op?: string;
		entity?: "task" | "project" | "scope" | "tag";
		project_id?: string;
		from?: string;
		to?: string;
		limit?: number;
		offset?: number;
	} = {},
): Promise<ActivityLogPage> {
	return unwrap<ActivityLogPage>(
		await client.POST("/api/activity_list", { body: input }),
	);
}
