import type { TaskFieldValues } from "#lib/tasks/fields.ts";

export interface CreatedTask {
	id: string;
	title: string;
}

export interface SavedDraft {
	values: TaskFieldValues;
	title: string;
}

export function createDraftStore() {
	let saved = $state<SavedDraft | null>(null);
	let last = $state<CreatedTask | null>(null);

	return {
		get saved() {
			return saved;
		},
		get last() {
			return last;
		},
		save(draft: SavedDraft) {
			saved = draft;
		},
		setLast(task: CreatedTask | null) {
			last = task;
		},
		clearDraft() {
			saved = null;
		},
		clear() {
			saved = null;
			last = null;
		},
	};
}

export type DraftStore = ReturnType<typeof createDraftStore>;
