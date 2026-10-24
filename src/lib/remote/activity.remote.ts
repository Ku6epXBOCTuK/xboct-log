import { z } from "zod";
import { listActivity, searchActivity } from "../server/activity";
import { getDb } from "../server/db";
import { defineQuery } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { strictObject } from "./strict";
import { ID_DESCRIPTION, taskIdSchema } from "#lib/tasks/ids.ts";

export const getTaskHistory = defineQuery({
	name: "tasks_history",
	description:
		"Show the change log of one task: when it was changed, from which surface (source: 'ui' or 'mcp') and which fields were touched. Returns: {items, total}, newest first; each item is { ts, source, op, fields, old_id }. A changed field keeps the old and the new value, a creation lists only the fields set beyond the defaults. Reads are not logged themselves. The history of a task follows it after a move to another project.",
	kind: "query",
	input: strictObject({
		id: taskIdSchema(ID_DESCRIPTION),
		limit: z
			.number()
			.int()
			.positive()
			.max(200)
			.optional()
			.describe("Maximum number of events to return (default 50, max 200)."),
	}),
	handler: ({ id, limit }) => {
		const db = getDb();
		return listActivity(db, {
			entity: "task",
			entity_id: resolveTaskOrThrow(db, id),
			limit,
		});
	},
});

export const listActivityLog = defineQuery({
	name: "activity_list",
	description:
		"Read the interaction log of the whole backlog: every recorded change with its time, source ('ui', 'mcp' or 'cli'), operation, entity type and id and the list of touched fields. A changed field keeps the old and the new value, a creation lists only the fields set beyond the defaults. Supports filters (source, op, entity, from, to) and pagination via limit and offset. Returns: {items, total, ops}, where ops is the list of known operation names.",
	kind: "query",
	input: strictObject({
		source: z
			.enum(["ui", "mcp", "cli"])
			.optional()
			.describe("Surface of the change."),
		op: z
			.string()
			.min(1)
			.optional()
			.describe("Operation name, for example tasks_update."),
		entity: z
			.enum(["task", "project", "scope"])
			.optional()
			.describe("Entity type of the changed object."),
		project_id: z
			.string()
			.min(1)
			.optional()
			.describe(
				"Project id: keeps the project's own events, events of its tasks and of its scopes.",
			),
		from: z
			.string()
			.min(1)
			.optional()
			.describe("Start of the period as an ISO date-time."),
		to: z
			.string()
			.min(1)
			.optional()
			.describe("End of the period as an ISO date-time."),
		limit: z
			.number()
			.int()
			.positive()
			.max(200)
			.optional()
			.describe("Maximum number of events to return (default 50, max 200)."),
		offset: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe("Number of events to skip, for pagination."),
	}),
	handler: ({ source, op, entity, project_id, from, to, limit, offset }) => {
		return searchActivity(getDb(), {
			source,
			op,
			entity,
			project_id,
			from,
			to,
			limit,
			offset,
		});
	},
});
