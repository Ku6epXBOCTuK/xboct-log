import { error } from "@sveltejs/kit";
import { z } from "zod";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import * as scopes from "../server/scopes";
import type { Scope } from "../types";
import { defineCommand, defineQuery } from "./define";
import { strictObject } from "./strict";

export const getScopes = defineQuery({
	name: "scopes_list",
	description:
		"List scopes, each with task_count (active non-epic tasks assigned, i.e. open/in-progress/blocked) and epics_count (non-deleted epics assigned). Pass project_id to limit to one project; omit it to list scopes across all projects.",
	kind: "query",
	input: strictObject({ project_id: z.string().min(1).optional() }),
	handler: ({ project_id }) => {
		const db = getDb();
		const counts = scopes.countTasksByScope(db, project_id);
		return scopes.listScopes(db, project_id).map((scope) => {
			const count = counts[scope.id] ?? { tasks: 0, epics: 0 };
			return { ...scope, task_count: count.tasks, epics_count: count.epics };
		});
	},
});

export const getScope = defineQuery({
	name: "scopes_get",
	description:
		"Get a single scope by id, including its task_count (active non-epic tasks) and epics_count.",
	kind: "query",
	input: strictObject({ id: z.number().int() }),
	handler: ({ id }) => {
		const db = getDb();
		const scope = scopes.getScope(db, id);
		if (!scope) {
			error(404, `scope ${id} not found`);
		}
		const count = scopes.countTasksByScope(db)[scope.id] ?? {
			tasks: 0,
			epics: 0,
		};
		return { ...scope, task_count: count.tasks, epics_count: count.epics };
	},
});

export const getScopedProjectIds = defineQuery({
	name: "scopes_project_ids",
	description: "List ids of all projects that have at least one scope.",
	kind: "query",
	input: strictObject({}),
	handler: () => scopes.scopedProjectIds(getDb()),
});

export const createScope = defineCommand({
	name: "scopes_create",
	description: "Create a scope in a project.",
	kind: "command",
	input: strictObject({
		project_id: z.string().min(1),
		name: z.string().min(1),
	}),
	handler: (input) => scopes.createScope(getDb(), input),
	activity: (input, scope: Scope) =>
		activityEntry("scope", scope.id, fieldNames(input)),
});

export const updateScope = defineCommand({
	name: "scopes_update",
	description: "Rename a scope by id.",
	kind: "command",
	input: strictObject({
		id: z.number().int(),
		patch: strictObject({ name: z.string().min(1) }),
	}),
	handler: ({ id, patch }) => scopes.updateScope(getDb(), id, patch),
	activity: (input, scope: Scope) =>
		activityEntry("scope", scope.id, fieldNames(input.patch)),
});

export const deleteScope = defineCommand({
	name: "scopes_delete",
	description: "Delete a scope by id; its tasks lose the scope assignment.",
	kind: "command",
	input: strictObject({ id: z.number().int() }),
	handler: ({ id }) => scopes.deleteScope(getDb(), id),
	activity: (input) => activityEntry("scope", input.id, []),
});
