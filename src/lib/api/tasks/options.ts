import type { Task } from "#lib/types.ts";
import { client, unwrap } from "#lib/api/system/client.ts";

export type TaskOptionsPage = { items: Task[]; total: number };

export async function getTaskOptions(
	input: { project_id?: string; q?: string; limit?: number } = {},
): Promise<TaskOptionsPage> {
	return unwrap<TaskOptionsPage>(
		await client.POST("/api/tasks_options", { body: input }),
	);
}
