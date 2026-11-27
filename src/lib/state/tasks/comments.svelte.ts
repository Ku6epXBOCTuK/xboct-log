import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { listComments } from "#lib/api/tasks/comments.ts";
import { type DataCell, data } from "#lib/data/data.svelte.ts";
import type { Comment } from "#lib/types.ts";

export function createCommentsStore() {
	const lists = new SvelteMap<string, DataCell<Comment[]>>();
	const loaded = $state<Record<string, boolean>>({});
	let watched: string | null = null;

	function list(taskId: string): DataCell<Comment[]> {
		return untrack(() => {
			let cell = lists.get(taskId);
			if (cell === undefined) {
				cell = data.cell<Comment[]>(`comments:${taskId}`, []);
				lists.set(taskId, cell);
			}
			return cell;
		});
	}

	function items(taskId: string): Comment[] {
		return list(taskId).value;
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
			await data.load(
				`comments:${taskId}`,
				() => listComments({ task_id: taskId }),
				(result) => {
					list(taskId).set(result.items);
					loaded[taskId] = true;
				},
				true,
			);
		},
		apply(comment: Comment): void {
			const current = items(comment.task_id);
			const index = current.findIndex((item) => item.id === comment.id);
			list(comment.task_id).set(
				index === -1
					? [...current, comment]
					: current.map((item) => (item.id === comment.id ? comment : item)),
			);
			loaded[comment.task_id] = true;
		},
		remove(taskId: string, id: string): void {
			list(taskId).set(items(taskId).filter((item) => item.id !== id));
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
