import { error } from "@sveltejs/kit";
import { z } from "zod";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import * as projects from "../server/projects";
import * as scopes from "../server/scopes";
import { countEpicsByStatus, countTasksByStatus } from "../server/tasks";
import type { Project } from "../types";
import { defineCommand, defineQuery } from "./define";
import { PROJECT_FIELDS } from "./shape";
import { strictObject } from "./strict";

export const getProjects = defineQuery({
	name: "projects_list",
	description:
		"List projects; set includeArchived to also return archived ones. Returns: the list of projects - every item is " +
		PROJECT_FIELDS +
		".",
	kind: "query",
	input: strictObject({ includeArchived: z.boolean().optional() }).default({}),
	handler: (options) => projects.listProjects(getDb(), options),
});

export const getProject = defineQuery({
	name: "projects_get",
	description:
		"Get a single project by id, including task counts by status: task_counts counts non-epic tasks, epic_counts counts epics. scope_counts lists the project's scopes with their task and epic totals. Returns: the project - " +
		PROJECT_FIELDS +
		" with task_counts, epic_counts and scope_counts.",
	kind: "query",
	input: strictObject({ id: z.string().min(1) }),
	handler: ({ id }) => {
		const db = getDb();
		const project = projects.getProject(db, id);
		if (!project) {
			error(404, `project ${id} not found`);
		}
		const scopeRows = scopes.listScopes(db, id);
		const scopeTotals = scopes.countScopeTotals(db, id);
		return {
			...project,
			task_counts: countTasksByStatus(db, id),
			epic_counts: countEpicsByStatus(db, id),
			scope_counts: scopeRows.map((scope) => ({
				scope_id: scope.id,
				name: scope.name,
				tasks: scopeTotals[scope.id]?.tasks ?? 0,
				epics: scopeTotals[scope.id]?.epics ?? 0,
			})),
		};
	},
});

export const createProject = defineCommand({
	name: "projects_create",
	description:
		"Create a project. name, id and prefix are required. The id is a lowercase slug of latin letters, digits and dashes; it is the key of the project in links and in the project_id parameter, and it cannot be changed later. The prefix is 1-6 uppercase letters or digits, it is stored uppercase and starts every task id of the project, and it cannot be changed later either. Returns: the created project - " +
		PROJECT_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		id: z.string().min(1).max(40),
		name: z.string().min(1),
		prefix: z.string().min(1).max(6),
	}),
	handler: (input) => projects.createProject(getDb(), input),
	activity: (input, project: Project) =>
		activityEntry("project", project.id, fieldNames(input)),
});

export const updateProject = defineCommand({
	name: "projects_update",
	description:
		"Rename a project or change its archived flag. The prefix is immutable — it defines task ids. Returns: the updated project - " +
		PROJECT_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		id: z.string().min(1),
		patch: strictObject({
			name: z.string().optional(),
			archived: z.boolean().optional(),
		}),
	}),
	handler: ({ id, patch }) => projects.updateProject(getDb(), id, patch),
	activity: (input, project: Project) =>
		activityEntry("project", project.id, fieldNames(input.patch)),
});
