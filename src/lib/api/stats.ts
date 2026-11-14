import type { Status, Task } from "#lib/types.ts";
import { client, unwrap } from "./client.ts";

export type TaskStats = {
	tasks: Record<Status, number>;
	epics: (Task & { children_counts?: Record<string, number> })[];
};

export async function getTaskStats(
	input: Record<string, never> = {},
): Promise<TaskStats> {
	return unwrap<TaskStats>(
		await client.POST("/api/tasks_stats", { body: input }),
	);
}
