import { fetchFresh } from "#lib/remote/fresh.ts";
import { listComments } from "#lib/remote/comments.remote.ts";
import type { Comment } from "#lib/types.ts";

export function createCommentsStore() {
	const byTask = $state<Record<string, Comment[]>>({});
	const loaded = $state<Record<string, boolean>>({});
	const requests: Record<string, number> = {};
	let watched: string | null = null;

	function items(taskId: string): Comment[] {
		return byTask[taskId] ?? [];
	}

	return {
		items,
		count(taskId: string): number {
			return items(taskId).length;
		},
		isLoaded(taskId: string): boolean {
			return loaded[taskId] === true;
		},
		async load(taskId: string): Promise<void> {
			// NOTE: only the newest request for a task may write the list, so a
			// slow answer cannot overwrite a comment that was just sent.
			const token = (requests[taskId] ?? 0) + 1;
			requests[taskId] = token;

			const result = await fetchFresh(listComments({ task_id: taskId }));
			if (requests[taskId] !== token) {
				return;
			}
			byTask[taskId] = result.items;
			loaded[taskId] = true;
		},
		apply(comment: Comment): void {
			const current = items(comment.task_id);
			const index = current.findIndex((item) => item.id === comment.id);
			byTask[comment.task_id] =
				index === -1
					? [...current, comment]
					: current.map((item) => (item.id === comment.id ? comment : item));
			loaded[comment.task_id] = true;
		},
		remove(taskId: string, id: string): void {
			byTask[taskId] = items(taskId).filter((item) => item.id !== id);
		},
		watch(taskId: string | null): void {
			watched = taskId;
		},
		async refresh(): Promise<void> {
			const taskId = watched;
			if (taskId === null) {
				return;
			}
			await this.load(taskId);
		},
	};
}

export type CommentsStore = ReturnType<typeof createCommentsStore>;
