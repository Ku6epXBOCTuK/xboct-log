import { z } from "zod";
import { getDb } from "../server/db";
import { listTags } from "../server/tasks";
import { STATUSES } from "../types";
import { defineQuery } from "./define";
import { strictObject } from "./strict";

export const getTags = defineQuery({
	name: "tags_list",
	description:
		"Read the tag dictionary of the backlog: every tag in use with the number of tasks that carry it. Read-only. Use it before filtering by tag, so you pick an existing tag name instead of guessing one. Accepts the filters project_id and status; soft-deleted tasks are not counted. Returns: {items, total}, where each item is { tag, count }, most used first.",
	kind: "query",
	input: strictObject({
		project_id: z
			.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
			.optional()
			.describe(
				"Count only the tags of these projects. Accepts one id or a list of ids.",
			),
		status: z
			.union([z.enum(STATUSES), z.array(z.enum(STATUSES)).min(1)])
			.optional()
			.describe(
				"Count only the tags of tasks in these statuses. Accepts one status or a list of statuses.",
			),
	}),
	handler: ({ project_id, status }) => {
		const items = listTags(getDb(), {
			project_id,
			status:
				status === undefined
					? undefined
					: Array.isArray(status)
						? status
						: [status],
		});
		return { items, total: items.length };
	},
});
