import { error } from "@sveltejs/kit";
import { z } from "zod";
import { listActivity } from "../server/activity";
import { getDb } from "../server/db";
import * as repo from "../server/tasks";
import { defineQuery } from "./define";
import { ID_DESCRIPTION, IN_PROJECT_DESCRIPTION } from "#lib/tasks/ids.ts";

export const getTaskHistory = defineQuery({
	name: "tasks_history",
	description:
		"Show the change log of one task: when it was changed, from which surface (source: 'ui' or 'mcp') and which fields were touched. Returns { items, total }, newest first; each item is { ts, source, op, fields, old_id }. Old and new values are not stored, only field names. Reads are not logged themselves. The history of a task follows it after a move to another project.",
	kind: "query",
	input: z.object({
		id: z.string().min(1).describe(ID_DESCRIPTION),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
		limit: z
			.number()
			.int()
			.positive()
			.max(200)
			.optional()
			.describe("Maximum number of events to return (default 50, max 200)."),
	}),
	handler: ({ id, in_project, limit }) => {
		const db = getDb();
		const resolved = repo.resolveTaskId(db, id, in_project);
		if (resolved.isErr()) {
			error(resolved.error.status, resolved.error.message);
		}
		return listActivity(db, {
			entity: "task",
			entity_id: resolved.value,
			limit,
		});
	},
});
