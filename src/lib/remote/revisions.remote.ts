import { z } from "zod";
import { getDb } from "../server/db";
import { listRevisions, REVISION_FIELDS } from "../server/revisions";
import { defineQuery } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { strictObject } from "./strict";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";

export const getTaskRevisions = defineQuery({
	name: "tasks_revisions_list",
	description:
		"Read the previous texts of one task: the description and the comment bodies that were replaced by an edit. Read-only. Returns: {items, total}, oldest first; each item is { id, task_id, field, ref_id, body, created_at }, where field is 'description' or 'comment' and ref_id is the id of the edited comment for a comment revision. The current text is not included. Use it to see how a description changed; the activity log only names the touched fields.",
	kind: "query",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
		field: z
			.enum(REVISION_FIELDS)
			.optional()
			.describe(
				"Keep only the revisions of this field. Omit it to get both descriptions and comments.",
			),
		limit: z
			.number()
			.int()
			.positive()
			.max(200)
			.optional()
			.describe("Maximum number of revisions to return (default 50, max 200)."),
	}),
	handler: ({ id, field, limit }) => {
		const db = getDb();
		const taskId = resolveTaskOrThrow(db, id);
		const revisions = listRevisions(db, taskId)
			.filter((revision) => field === undefined || revision.field === field)
			.slice(0, limit ?? 50);
		return { items: revisions, total: revisions.length };
	},
});
