import { error } from "@sveltejs/kit";
import { z } from "zod";
import { normalizeRepo, repoError } from "../projects/create";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import * as projects from "../server/projects";
import * as scopes from "../server/scopes";
import { countEpicsByStatus, countTasksByStatus } from "../server/tasks";
import type { Project } from "../types";
import { projectList, projectRef } from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { PROJECT_FIELDS } from "./shape";
import { strictObject } from "./strict";

export const getProjects = defineQuery({
	name: "projects_list",
	output: projectList,
	description:
		"List projects; set includeArchived to also return archived ones. " +
		"q filters by a case-insensitive substring of the project name, id, prefix or repo. " +
		"repo matches the repository exactly after normalization to host/owner/name. " +
		"Every item carries task_counts and epic_counts: the number of its " +
		"non-epic tasks and epics per status. Returns: {items} - every item is " +
		"every item is " +
		PROJECT_FIELDS +
		" with task_counts and epic_counts.",
	kind: "query",
	input: strictObject({
		includeArchived: z.boolean().optional(),
		q: z
			.string()
			.min(1)
			.optional()
			.describe(
				"Case-insensitive substring match on the project name, id, prefix or repo.",
			),
		repo: z
			.string()
			.min(1)
			.optional()
			.describe(
				"Exact repository lookup, canonical host/owner/name. Accepts a git URL and normalizes it.",
			),
	}).default({}),
	handler: (options) => {
		const db = getDb();
		const q = options.q?.trim().toLowerCase();
		let repo: string | undefined;
		if (options.repo !== undefined) {
			const repositoryError = repoError(options.repo);
			if (repositoryError !== null) {
				error(400, repositoryError);
			}
			const normalized = normalizeRepo(options.repo)?.toLowerCase();
			if (normalized === undefined || normalized === null) {
				error(400, "Repository must look like host/owner/name");
			}
			repo = normalized;
		}
		return projects
			.listProjects(db, options)
			.filter((project) =>
				repo === undefined ? true : (project.repo ?? "").toLowerCase() === repo,
			)
			.filter((project) =>
				q
					? project.id.toLowerCase().includes(q) ||
						project.name.toLowerCase().includes(q) ||
						project.prefix.toLowerCase().includes(q) ||
						(project.repo ?? "").toLowerCase().includes(q)
					: true,
			)
			.map((project) => ({
				...project,
				task_counts: countTasksByStatus(db, project.id),
				epic_counts: countEpicsByStatus(db, project.id),
			}));
	},
});

export const getProject = defineQuery({
	name: "projects_get",
	output: projectRef,
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
		const scopeCounts = scopes.countTasksByScope(db, id);
		return {
			...project,
			task_counts: countTasksByStatus(db, id),
			epic_counts: countEpicsByStatus(db, id),
			scope_counts: scopeRows.map((scope) => ({
				scope_id: scope.id,
				name: scope.name,
				tasks: scopeCounts[scope.id]?.tasks ?? 0,
				epics: scopeCounts[scope.id]?.epics ?? 0,
			})),
		};
	},
});

export const createProject = defineCommand({
	name: "projects_create",
	output: projectRef,
	description:
		"Create a project. name, id and prefix are required. The id is a lowercase slug of latin letters, digits and dashes; it is the key of the project in links and in the project_id parameter, and it cannot be changed later. The prefix is 1-6 uppercase letters or digits, it is stored uppercase and starts every task id of the project, and it cannot be changed later either. repo is optional and accepts a git URL; it is stored as host/owner/name. Returns: the created project - " +
		PROJECT_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		id: z.string().min(1).max(40),
		name: z.string().min(1),
		prefix: z.string().min(1).max(6),
		repo: z
			.string()
			.nullable()
			.optional()
			.describe(
				"Git repository as host/owner/name; a full URL or SSH form is normalized. Optional.",
			),
	}),
	handler: (input) => projects.createProject(getDb(), input),
	activity: (input, project: Project) =>
		activityEntry("project", project.id, fieldNames(input)),
});

export const updateProject = defineCommand({
	name: "projects_update",
	output: projectRef,
	description:
		"Rename a project, change its archived flag or set its repository. The prefix is immutable — it defines task ids. repo takes host/owner/name or a git URL and null clears it. Returns: the updated project - " +
		PROJECT_FIELDS +
		".",
	kind: "command",
	input: strictObject({
		id: z.string().min(1),
		patch: strictObject({
			name: z.string().optional(),
			archived: z.boolean().optional(),
			repo: z
				.string()
				.nullable()
				.optional()
				.describe(
					"Git repository as host/owner/name; a full URL or SSH form is normalized. null clears it.",
				),
		}),
	}),
	handler: ({ id, patch }) => projects.updateProject(getDb(), id, patch),
	activity: (input, project: Project) =>
		activityEntry("project", project.id, fieldNames(input.patch)),
});
