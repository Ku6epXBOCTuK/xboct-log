import type { TaskStore } from "#lib/state/tasks.svelte.ts";
import type { Task } from "#lib/types.ts";

export function createSelection(source: Pick<TaskStore, "byId">) {
	let id = $state<string | null>(null);

	function current(): Task | null {
		return id === null ? null : (source.byId(id) ?? null);
	}

	return {
		get id() {
			return id;
		},
		get task() {
			return current();
		},
		get projectId() {
			return current()?.project_id ?? null;
		},
		select(value: string | null) {
			id = value;
		},
		clear() {
			id = null;
		},
	};
}

export type Selection = ReturnType<typeof createSelection>;
