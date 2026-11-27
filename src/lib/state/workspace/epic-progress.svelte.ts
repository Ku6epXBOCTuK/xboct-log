import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { getTask } from "#lib/api/tasks/tasks.ts";
import { type DataCell, data } from "#lib/data/data.svelte.ts";
import {
	type EpicProgress,
	epicProgress,
} from "#lib/tasks/progress/epic-progress.ts";

export function createEpicProgress() {
	const entries = new SvelteMap<string, DataCell<EpicProgress | null>>();
	const tracked: Record<string, boolean> = {};

	function entry(id: string): DataCell<EpicProgress | null> {
		return untrack(() => {
			let cell = entries.get(id);
			if (cell === undefined) {
				cell = data.cell<EpicProgress | null>(`epic-progress:${id}`, null);
				entries.set(id, cell);
			}
			return cell;
		});
	}

	async function load(id: string, force = false) {
		tracked[id] = true;
		try {
			await data.load(
				`epic-progress:${id}`,
				() => getTask({ task_id: id }),
				(task) => entry(id).set(epicProgress(task.children_counts)),
				force,
			);
		} catch {
			// NOTE: keep the last known counts when the server is unavailable
		}
	}

	return {
		of(id: string): EpicProgress | null {
			return entry(id).value;
		},
		load(id: string): void {
			void load(id);
		},
		async refresh(): Promise<void> {
			await Promise.allSettled(
				Object.keys(tracked).map((id) => load(id, true)),
			);
		},
	};
}
