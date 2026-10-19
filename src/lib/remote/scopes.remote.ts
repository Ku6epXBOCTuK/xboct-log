import { error } from "@sveltejs/kit";
import { z } from "zod";
import { getDb } from "../server/db";
import * as scopes from "../server/scopes";
import { defineCommand, defineQuery } from "./define";

export const getScopes = defineQuery({
	name: "scopes_list",
	description:
		"List scopes, each with its task_count (number of active tasks assigned). Pass project_id to limit to one project; omit it to list scopes across all projects.",
	kind: "query",
	input: z.object({ project_id: z.string().min(1).optional() }),
	handler: ({ project_id }) => {
		const db = getDb();
		const counts = scopes.countTasksByScope(db, project_id);
		return scopes
			.listScopes(db, project_id)
			.map((scope) => ({ ...scope, task_count: counts[scope.id] ?? 0 }));
	},
});

export const getScope = defineQuery({
	name: "scopes_get",
	description: "Get a single scope by id, including its task_count.",
	kind: "query",
	input: z.object({ id: z.number().int() }),
	handler: ({ id }) => {
		const db = getDb();
		const scope = scopes.getScope(db, id);
		if (!scope) {
			error(404, `scope ${id} not found`);
		}
		const counts = scopes.countTasksByScope(db);
		return { ...scope, task_count: counts[scope.id] ?? 0 };
	},
});

export const getScopedProjectIds = defineQuery({
	name: "scopes_project_ids",
	description: "List ids of all projects that have at least one scope.",
	kind: "query",
	input: z.object({}),
	handler: () => scopes.scopedProjectIds(getDb()),
});

export const createScope = defineCommand({
	name: "scopes_create",
	description: "Create a scope in a project.",
	kind: "command",
	input: z.object({ project_id: z.string().min(1), name: z.string().min(1) }),
	handler: (input) => scopes.createScope(getDb(), input),
});

export const updateScope = defineCommand({
	name: "scopes_update",
	description: "Rename a scope by id.",
	kind: "command",
	input: z.object({
		id: z.number().int(),
		patch: z.object({ name: z.string().min(1) }),
	}),
	handler: ({ id, patch }) => scopes.updateScope(getDb(), id, patch),
});

export const deleteScope = defineCommand({
	name: "scopes_delete",
	description: "Delete a scope by id; its tasks lose the scope assignment.",
	kind: "command",
	input: z.object({ id: z.number().int() }),
	handler: ({ id }) => scopes.deleteScope(getDb(), id),
});
