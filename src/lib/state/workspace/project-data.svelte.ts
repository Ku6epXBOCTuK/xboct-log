import { SvelteMap } from "svelte/reactivity";
import { fetchFresh } from "#lib/api/fresh.ts";
import { getTaskOptions } from "#lib/api/tasks/options.ts";
import { getTags } from "#lib/api/workspace/tags.ts";
import { type DataCell, data } from "#lib/data/data.svelte.ts";
import type { TagEntry } from "#lib/state/tags/tags.svelte.ts";
import type { Task } from "#lib/types.ts";

export interface ProjectData {
	tasks: Task[];
	tags: TagEntry[];
}

export function createProjectData() {
	const entries = new SvelteMap<string, DataCell<ProjectData>>();
	const pending: Record<string, boolean> = {};

	function entry(projectId: string): DataCell<ProjectData> {
		let cell = entries.get(projectId);
		if (cell === undefined) {
			cell = data.cell<ProjectData>(`project-data:${projectId}`, {
				tasks: [],
				tags: [],
			});
			entries.set(projectId, cell);
		}
		return cell;
	}

	async function fetchProject(projectId: string) {
		await data.load(
			`project-data:${projectId}`,
			async () =>
				Promise.all([
					fetchFresh(getTaskOptions({ project_id: projectId })),
					fetchFresh(getTags({ project_id: projectId })),
				]),
			([tasks, tags]) =>
				entry(projectId).set({ tasks: tasks.items, tags: tags.items }),
			true,
		);
	}

	async function load(projectId: string) {
		if (projectId === "" || pending[projectId] === true) return;
		pending[projectId] = true;
		try {
			await fetchProject(projectId);
		} catch {
			return;
		} finally {
			delete pending[projectId];
		}
	}

	return {
		of(projectId: string): ProjectData | undefined {
			return entries.has(projectId) ? entry(projectId).value : undefined;
		},
		ensure(projectId: string): void {
			void load(projectId);
		},
		async refresh() {
			await Promise.allSettled(
				[...entries.keys()].map((id) => fetchProject(id)),
			);
		},
	};
}

export type ProjectDataStore = ReturnType<typeof createProjectData>;
