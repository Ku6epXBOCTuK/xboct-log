import { getTask } from "#lib/api/tasks.ts";
import { type EpicProgress, epicProgress } from "#lib/tasks/epic-progress.ts";

export function createEpicProgress() {
	let entries = $state<Record<string, EpicProgress | null>>({});
	const tracked: Record<string, boolean> = {};
	const pending: Record<string, boolean> = {};
	const requests: Record<string, number> = {};

	async function load(id: string) {
		tracked[id] = true;
		if (pending[id]) return;

		pending[id] = true;
		const request = (requests[id] ?? 0) + 1;
		requests[id] = request;

		try {
			const task = await getTask({ task_id: id });
			if (requests[id] === request) {
				entries = { ...entries, [id]: epicProgress(task.children_counts) };
			}
		} catch {
			// NOTE: keep the last known counts when the server is unavailable
		} finally {
			delete pending[id];
		}
	}

	return {
		of(id: string): EpicProgress | null {
			return entries[id] ?? null;
		},
		load(id: string): void {
			void load(id).catch(() => {});
		},
		async refresh(): Promise<void> {
			await Promise.allSettled(Object.keys(tracked).map((id) => load(id)));
		},
	};
}
