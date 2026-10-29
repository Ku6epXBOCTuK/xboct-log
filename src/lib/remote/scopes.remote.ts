import { error } from "@sveltejs/kit";
import { z } from "zod";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import * as scopes from "../server/scopes";
import type { Scope } from "../types";
import { idList, scopeDeleteReport, scopeList, scopeRef } from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { SCOPE_FIELDS } from "./shape";
import { strictObject } from "./strict";

export const getScopes = defineQuery({
	name: "scopes_list",
	output: scopeList,
	description:
		"List scopes, each with task_count (active non-epic tasks assigned, i.e. open/in-progress/blocked), tasks_total (all unfinished and closed non-epic tasks assigned) and epics_count (non-deleted epics assigned). Pass project_id to limit to one project; omit it to list scopes across all projects. Returns: {items} - every item is " +
		SCOPE_FIELDS +
		".",
	kind: "query",
	input: strictObject({ project_id: z.string().min(1).optional() }),
	handler: ({ project_id }) => {
		const db = getDb();
		const counts = scopes.countTasksByScope(db, project_id);
		return scopes.listScopes(db, project_id).map((scope) => {
			const count = counts[scope.id] ?? {
				tasks: 0,
				active_tasks: 0,
				epics: 0,
			};
			return {
				...scope,
				task_count: count.active_tasks,
				tasks_total: count.tasks,
				epics_count: count.epics,
			};
		});
	},
});

export const getScope = defineQuery({
	name: "scopes_get",
	output: scopeRef,
	description:
		"Get a single scope by scope_id, including its task_count (active non-epic tasks), tasks_total (all non-epic tasks) and epics_count. Returns: the scope - " +
		SCOPE_FIELDS +
		".",
	kind: "query",
	input: strictObject({ scope_id: z.number().int() }),
	handler: ({ scope_id }) => {
		const db = getDb();
		const scope = scopes.getScope(db, scope_id);
		if (!scope) {
			error(404, `scope ${scope_id} not found`);
		}
		const count = scopes.countTasksByScope(db)[scope.id] ?? {
			tasks: 0,
			active_tasks: 0,
			epics: 0,
		};
		return {
			...scope,
			task_count: count.active_tasks,
			tasks_total: count.tasks,
			epics_count: count.epics,
		};
	},
});

export const getScopedProjectIds = defineQuery({
	name: "scopes_project_ids",
	output: idList,
	description:
		"List ids of all projects that have at least one scope. Returns: {items} - the list of project ids.",
	kind: "query",
	input: strictObject({}),
	handler: () => scopes.scopedProjectIds(getDb()),
});

export const createScope = defineCommand({
	name: "scopes_create",
	output: scopeRef,
	description:
		"Create a scope in a project. A scope groups the tasks of that project; a task points at its scope through scope_id. Returns: the created scope - " +
		SCOPE_FIELDS +
		".",
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
	output: scopeRef,
	description:
		"Rename a scope by scope_id. Returns: the updated scope - " +
		SCOPE_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		scope_id: z.number().int(),
		patch: strictObject({ name: z.string().min(1) }),
	}),
	handler: ({ scope_id, patch }) =>
		scopes.updateScope(getDb(), scope_id, patch),
	activity: (input, scope: Scope) =>
		activityEntry("scope", scope.id, fieldNames(input.patch)),
});

export const deleteScope = defineCommand({
	name: "scopes_delete",
	output: scopeDeleteReport,
	description:
		"Delete a scope by scope_id; its tasks lose the scope assignment. Pass dry_run: true to preview the deletion - it returns the scope and the ids of the tasks and epics that would lose it, and changes nothing. Returns: {scope, task_ids, epic_ids, dry_run} - the deleted scope and the ids of the tasks and epics that lost it; with dry_run the same report without changing anything.",
	kind: "command",
	input: strictObject({
		scope_id: z.number().int(),
		dry_run: z
			.boolean()
			.optional()
			.describe(
				"Preview the deletion instead of performing it: returns the scope and the ids of the tasks and epics that would lose the scope.",
			),
	}),
	handler: ({ scope_id, dry_run }) =>
		dry_run
			? scopes.previewScopeDelete(getDb(), scope_id)
			: scopes.deleteScopeDetailed(getDb(), scope_id),
	activity: (input, result: scopes.ScopeDeleteReport) =>
		input.dry_run
			? null
			: [
					activityEntry("scope", input.scope_id, []),
					...[...result.task_ids, ...result.epic_ids].map((taskId) =>
						activityEntry("task", taskId, ["scope_id"], null, [
							{ field: "scope_id", from: input.scope_id, to: null },
						]),
					),
				],
});
