import { fetchFresh } from "#lib/api/fresh.ts";
import { getTaskStats } from "#lib/api/tasks/stats.ts";
import { data } from "#lib/data/data.svelte.ts";
import {
	activeCount,
	emptyCounts,
	epicActive,
	type StatusCounts,
	summarize,
} from "#lib/tasks/presentation/counts.ts";
import type { EpicSummary } from "#lib/types.ts";

export function createStatsStore(initial?: {
	counts?: StatusCounts;
	epics?: EpicSummary[];
}) {
	const counts = data.cell<StatusCounts>(
		"stats:counts",
		initial?.counts ?? emptyCounts(),
	);
	const epics = data.cell<EpicSummary[]>("stats:epics", initial?.epics ?? []);

	async function load() {
		try {
			await data.load(
				"stats",
				() => fetchFresh(getTaskStats({})),
				(stats) => {
					counts.set(stats.tasks);
					epics.set(stats.epics);
				},
				true,
			);
		} catch {
			return;
		}
	}

	return {
		get counts() {
			return counts.value;
		},
		get activeTasks() {
			return activeCount(counts.value) + epicActive(epics.value);
		},
		get summary() {
			return summarize(counts.value, epics.value);
		},
		get inProgress() {
			return counts.value["in-progress"] ?? 0;
		},
		get epics() {
			return epics.value;
		},
		load,
		refresh: load,
	};
}

export type StatsStore = ReturnType<typeof createStatsStore>;
