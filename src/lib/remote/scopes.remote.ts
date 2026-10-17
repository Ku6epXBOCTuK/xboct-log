import { command, query } from "$app/server";
import { z } from "zod";
import { getDb } from "../server/db";
import * as scopes from "../server/scopes";
import { unwrap } from "./result";

export const getScopes = query(z.string().min(1), (projectId) =>
	scopes.listScopes(getDb(), projectId),
);

export const getScopedProjectIds = query(() =>
	scopes.scopedProjectIds(getDb()),
);

export const createScope = command(
	z.object({ project_id: z.string().min(1), name: z.string().min(1) }),
	(input) => unwrap(scopes.createScope(getDb(), input)),
);

export const updateScope = command(
	z.object({
		id: z.number().int(),
		patch: z.object({ name: z.string().optional() }),
	}),
	({ id, patch }) => unwrap(scopes.updateScope(getDb(), id, patch)),
);

export const deleteScope = command(z.number().int(), (id) =>
	unwrap(scopes.deleteScope(getDb(), id)),
);
