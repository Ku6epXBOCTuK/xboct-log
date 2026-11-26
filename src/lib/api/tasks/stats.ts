import type { EpicSummary, Status } from "#lib/types.ts";
import { client, unwrap } from "#lib/api/system/client.ts";

export type TaskStats = {
	tasks: Record<Status, number>;
	epics: EpicSummary[];
};

export async function getTaskStats(
	input: Record<string, never> = {},
): Promise<TaskStats> {
	return unwrap<TaskStats>(
		await client.POST("/api/tasks_stats", { body: input }),
	);
}
