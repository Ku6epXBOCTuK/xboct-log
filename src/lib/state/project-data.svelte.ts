import { fetchFresh } from "#lib/remote/fresh.ts";
import { getTaskOptions } from "#lib/remote/options.remote.ts";
import { getTags } from "#lib/remote/tags.remote.ts";
import type { TagEntry } from "#lib/state/tags.svelte.ts";
import type { Task } from "#lib/types.ts";

export interface ProjectData {
	tasks: Task[];
	tags: TagEntry[];
}

export function createProjectData() {
	let entries = $state<Record<string, ProjectData>>({});
	const pending: Record<string, true> = {};

	async function fetchProject(projectId: string) {
		const [tasks, tags] = await Promise.all([
			fetchFresh(getTaskOptions({ project_id: projectId })),
			fetchFresh(getTags({ project_id: projectId })),
		]);

		entries = {
			...entries,
			[projectId]: { tasks: tasks.items, tags: tags.items },
		};
	}

	async function load(projectId: string) {
		if (projectId === "" || entries[projectId] !== undefined) return;
		if (pending[projectId] === true) return;
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
			return entries[projectId];
		},
		ensure(projectId: string): void {
			void load(projectId);
		},
		async refresh() {
			const loaded = Object.keys(entries);
			await Promise.allSettled(loaded.map((id) => fetchProject(id)));
		},
	};
}

export type ProjectDataStore = ReturnType<typeof createProjectData>;
