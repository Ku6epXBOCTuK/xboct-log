import { fetchFresh } from "#lib/api/fresh.ts";
import { getTaskStats } from "#lib/api/stats.ts";
import {
	activeCount,
	emptyCounts,
	epicActive,
	type StatusCounts,
	summarize,
} from "#lib/tasks/counts.ts";
import type { EpicSummary } from "#lib/types.ts";

export function createStatsStore(initial?: {
	counts?: StatusCounts;
	epics?: EpicSummary[];
}) {
	let counts = $state<StatusCounts>(initial?.counts ?? emptyCounts());
	let epics = $state<EpicSummary[]>(initial?.epics ?? []);
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
