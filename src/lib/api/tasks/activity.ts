import type { ActivityItem, ActivityLogItem } from "#lib/types.ts";
import { client, unwrap } from "#lib/api/system/client.ts";
import type { operations } from "#lib/api/schema.d.ts";

type ActivitySearch =
	operations["activity_list"]["requestBody"]["content"]["application/json"];

export type ActivityOp = NonNullable<ActivitySearch["op"]>;
export type ActivityEntityFilter = NonNullable<ActivitySearch["entity"]>;

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
		op?: ActivityOp;
		entity?: ActivityEntityFilter;
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
