import { getTaskOptions } from "#lib/remote/options.remote.ts";
import { fetchFresh } from "#lib/remote/fresh.ts";
import { createDebouncedValue } from "#lib/state/debounce.svelte.ts";
import type { Task } from "#lib/types.ts";

export function createTaskFinder() {
	const search = createDebouncedValue("");
	let found = $state<Task[]>([]);
	let request = 0;

	$effect(() => {
		const text = search.applied.trim();
		if (text === "") {
			found = [];
			return;
		}
		const current = ++request;
		void fetchFresh(getTaskOptions({ q: text }))
			.then((page) => {
				if (current !== request) return;
				found = page.items;
			})
			.catch(() => {
				if (current === request) found = [];
			});
	});

	$effect(() => () => search.cancel());

	return {
		get found() {
			return found;
		},
		search(query: string) {
			search.set(query);
		},
	};
}

export type TaskFinder = ReturnType<typeof createTaskFinder>;
