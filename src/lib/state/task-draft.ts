import type { TaskPatch } from "#lib/tasks/fields.ts";

export const DRAFT_FLUSH_MS = 10_000;

export interface TaskDraftOptions {
	save: (id: string, patch: TaskPatch) => void;
	delay?: number;
}

export function createTaskDraft({
	save,
	delay = DRAFT_FLUSH_MS,
}: TaskDraftOptions) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pendingId: string | null = null;
	let pending: TaskPatch = {};

	function stop() {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function flush() {
		stop();
		const id = pendingId;
		const patch = pending;
		pendingId = null;
		pending = {};
		if (id === null || Object.keys(patch).length === 0) return;
		save(id, patch);
	}

	function draft(id: string, patch: TaskPatch) {
		if (pendingId !== null && pendingId !== id) flush();
		pendingId = id;
		pending = { ...pending, ...patch };
		stop();
		timer = setTimeout(flush, delay);
	}

	function cancel() {
		stop();
	}

	function release(id: string | null) {
		if (pendingId !== null && pendingId !== id) flush();
	}

	return { draft, flush, cancel, release };
}

export type TaskDraft = ReturnType<typeof createTaskDraft>;
