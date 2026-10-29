import { fetchFresh } from "#lib/remote/fresh.ts";
import {
	createProject,
	getProjects,
	updateProject,
} from "#lib/remote/projects.remote.ts";
import { sortProjects } from "#lib/projects/sort.ts";
import type { Project } from "#lib/types.ts";

export interface NewProjectInput {
	id: string;
	name: string;
	prefix: string;
	repo?: string | null;
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
				project.id === updated.id
					? {
							...project,
							...updated,
							task_counts: updated.task_counts ?? project.task_counts,
							epic_counts: updated.epic_counts ?? project.epic_counts,
						}
					: project,
			),
		);
	}

	function replaceAll(next: Project[]) {
		projects = sortProjects(next);
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
		replaceAll,
		async refresh() {
			replaceAll(await fetchFresh(getProjects({ includeArchived: true })));
		},
		async create(input: NewProjectInput) {
			const { id, ...rest } = input;
			const project = await createProject({ project_id: id, ...rest });
			projects = sortProjects([...projects, project]);
			return project;
		},
		async rename(id: string, name: string) {
			const updated = await updateProject({
				project_id: id,
				patch: { name },
			});
			replace(updated);
			return updated;
		},
		async setArchived(id: string, archived: boolean) {
			const updated = await updateProject({
				project_id: id,
				patch: { archived },
			});
			replace(updated);
			return updated;
		},
		async setRepo(id: string, repo: string | null) {
			const updated = await updateProject({
				project_id: id,
				patch: { repo },
			});
			replace(updated);
			return updated;
		},
	};
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
