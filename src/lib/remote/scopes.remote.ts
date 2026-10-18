import { z } from "zod";
import { getDb } from "../server/db";
import * as scopes from "../server/scopes";
import { defineCommand, defineQuery } from "./define";

export const getScopes = defineQuery({
	name: "scopes_list",
	description: "List scopes of a project by project id.",
	kind: "query",
	input: z.object({ project_id: z.string().min(1) }),
	handler: ({ project_id }) => scopes.listScopes(getDb(), project_id),
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
		patch: z.object({ name: z.string().optional() }),
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
