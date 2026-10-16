import { error } from "@sveltejs/kit";
import { command, query } from "$app/server";
import { z } from "zod";
import { getDb } from "../server/db";
import * as projects from "../server/projects";
import { countTasksByStatus } from "../server/tasks";
import { unwrap } from "./result";

export const getProjects = query(
	z.object({ includeArchived: z.boolean().optional() }).default({}),
	(options) => projects.listProjects(getDb(), options),
);

export const getProject = query(z.string().min(1), (id) => {
	const db = getDb();
	const project = projects.getProject(db, id);
	if (!project) {
		error(404, `project ${id} not found`);
	}
	return { ...project, task_counts: countTasksByStatus(db, id) };
});

export const createProject = command(
	z.object({
		id: z.string().min(1),
		name: z.string().min(1),
		prefix: z.string().min(1),
	}),
	(input) => unwrap(projects.createProject(getDb(), input)),
);

export const updateProject = command(
	z.object({
		id: z.string().min(1),
		patch: z.object({
			name: z.string().optional(),
			archived: z.boolean().optional(),
		}),
	}),
	({ id, patch }) => unwrap(projects.updateProject(getDb(), id, patch)),
);
