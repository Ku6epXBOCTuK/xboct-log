import { createProject, updateProject } from "#lib/remote/projects.remote.ts";
import { sortProjects } from "#lib/projects/sort.ts";
import type { Project } from "#lib/types.ts";

export interface NewProjectInput {
	id: string;
	name: string;
	prefix: string;
}

export function createProjectStore(initial: Project[]) {
	let projects = $state(sortProjects(initial));
	const active = $derived(
		projects.filter((project) => project.archived_at === null),
	);
	const archived = $derived(
		projects.filter((project) => project.archived_at !== null),
	);

	function replace(updated: Project) {
		projects = sortProjects(
			projects.map((project) =>
				project.id === updated.id ? updated : project,
			),
		);
	}

	return {
		get all() {
			return projects;
		},
		get active() {
			return active;
		},
		get archived() {
			return archived;
		},
		async create(input: NewProjectInput) {
			const project = await createProject(input);
			projects = sortProjects([...projects, project]);
			return project;
		},
		async rename(id: string, name: string) {
			const updated = await updateProject({ id, patch: { name } });
			replace(updated);
			return updated;
		},
		async setArchived(id: string, archived: boolean) {
			const updated = await updateProject({ id, patch: { archived } });
			replace(updated);
			return updated;
		},
	};
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
