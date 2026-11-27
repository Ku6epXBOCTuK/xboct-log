import { fetchFresh } from "#lib/api/fresh.ts";
import { getTaskOptions } from "#lib/api/tasks/options.ts";
import { data } from "#lib/data/data.svelte.ts";
import { createDebouncedValue } from "#lib/state/ui/debounce.svelte.ts";
import type { Task } from "#lib/types.ts";

export function createTaskFinder() {
	const search = createDebouncedValue("");
	const found = data.cell<Task[]>("finder:found", []);

	$effect(() => {
		const text = search.applied.trim();
		if (text === "") {
			found.set([]);
			return;
		}
		void data
			.load(
				`finder:${text}`,
				() => fetchFresh(getTaskOptions({ q: text })),
				(page) => found.set(page.items),
				true,
			)
			.catch(() => found.set([]));
	});

	$effect(() => () => search.cancel());

	return {
		get found() {
			return found.value;
		},
		search(query: string) {
			search.set(query);
		},
	};
}

export type TaskFinder = ReturnType<typeof createTaskFinder>;
