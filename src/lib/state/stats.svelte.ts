import { fetchFresh } from "#lib/remote/fresh.ts";
import { getTaskStats } from "#lib/remote/stats.remote.ts";
import {
	activeCount,
	epicActive,
	emptyCounts,
	summarize,
	type StatusCounts,
} from "#lib/tasks/counts.ts";
import type { Task } from "#lib/types.ts";

export function createStatsStore(initial?: {
	counts?: StatusCounts;
	epics?: Task[];
}) {
	let counts = $state<StatusCounts>(initial?.counts ?? emptyCounts());
	let epics = $state<Task[]>(initial?.epics ?? []);
	let request = 0;

	async function load() {
		const current = ++request;

		try {
			const stats = await fetchFresh(getTaskStats({}));

			if (current !== request) return;

			counts = stats.tasks;
			epics = stats.epics;
		} catch {
			return;
		}
	}

	return {
		get counts() {
			return counts;
		},
		get activeTasks() {
			return activeCount(counts) + epicActive(epics);
		},
		get summary() {
			return summarize(counts, epics);
		},
		get inProgress() {
			return counts["in-progress"] ?? 0;
		},
		get epics() {
			return epics;
		},
		load,
		refresh: load,
	};
}

export type StatsStore = ReturnType<typeof createStatsStore>;
