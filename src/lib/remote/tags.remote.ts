import { z } from "zod";
import { getDb } from "../server/db";
import { listTags } from "../server/tasks";
import { STATUSES } from "../types";
import { tagList } from "./contracts";
import { defineQuery } from "./define";
import { oneOrList } from "./list";
import { strictObject } from "./strict";

export const getTags = defineQuery({
	name: "tags_list",
	output: tagList,
	description:
		"Read the tag dictionary of the backlog: every tag in use with the number of tasks that carry it and the number of open ones. Read-only. The dictionary is global by default, so shared tags used only in another project are still listed. Use it before filtering by tag, so you pick an existing tag name instead of guessing one. Accepts the filters project_id and status; soft-deleted tasks are not counted. Returns: {items, total}, where each item is { tag, count, active }, most used first. active counts the tasks whose status is not closed.",
	kind: "query",
	input: strictObject({
		project_id: oneOrList(z.array(z.string().min(1)).optional()).describe(
			"Count only the tags of these projects. Accepts one id or a list of ids.",
		),
		status: oneOrList(z.array(z.enum(STATUSES)).optional()).describe(
			"Count only the tags of tasks in these statuses. Accepts one status or a list of statuses.",
		),
	}),
	handler: ({ project_id, status }) => {
		const items = listTags(getDb(), { project_id, status });
		return { items, total: items.length };
	},
});
