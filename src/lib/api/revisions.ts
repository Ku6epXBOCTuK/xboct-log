import type { TaskRevision } from "#lib/types.ts";
import { client, unwrap } from "./client.ts";

export type RevisionsPage = { items: TaskRevision[]; total: number };

export async function getTaskRevisions(input: {
	task_id: string;
	field?: "description" | "comment";
	limit?: number;
}): Promise<RevisionsPage> {
	return unwrap<RevisionsPage>(
		await client.POST("/api/tasks_revisions_list", { body: input }),
	);
}
