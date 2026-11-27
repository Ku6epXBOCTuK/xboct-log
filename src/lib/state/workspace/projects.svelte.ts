import { fetchFresh } from "#lib/api/fresh.ts";
import {
	createProject,
	getProjects,
	updateProject,
} from "#lib/api/workspace/projects.ts";
import { data } from "#lib/data/data.svelte.ts";
import { sortProjects } from "#lib/projects/sort.ts";
import type { Project } from "#lib/types.ts";

export interface NewProjectInput {
	id: string;
	name: string;
	prefix: string;
	repo?: string | null;
}

export function createProjectStore(
	initial: Project[],
	onCreated?: () => void | Promise<void>,
) {
	const entities = data.entities<Project>("projects", (current, next) => ({
		...current,
		...next,
		task_counts: next.task_counts ?? current.task_counts,
		epic_counts: next.epic_counts ?? current.epic_counts,
	}));
	const ids = data.cell<string[]>(
		"projects:ids",
		sortProjects(initial).map((project) => project.id),
	);
	for (const project of initial) entities.put(project);

	const projects = $derived(
		ids.value
			.map((id) => entities.get(id))
			.filter((project): project is Project => project !== undefined),
	);
	const active = $derived(
		projects.filter((project) => project.archived_at === null),
	);
	const archived = $derived(
		projects.filter((project) => project.archived_at !== null),
	);

	function replace(updated: Project) {
		entities.put(updated);
	}

	function replaceAll(next: Project[]) {
		for (const project of next) entities.put(project);
		ids.set(sortProjects(next).map((project) => project.id));
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
			await data.load(
				"projects",
				() => fetchFresh(getProjects({ includeArchived: true })),
				(next) => replaceAll(next),
				true,
			);
		},
		async create(input: NewProjectInput) {
			const { id, ...rest } = input;
			const project = await createProject({ project_id: id, ...rest });
			entities.put(project);
			ids.set(sortProjects([...projects, project]).map((item) => item.id));
			try {
				await onCreated?.();
			} catch (error) {
				console.warn("[projects] created hook failed", error);
			}
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
