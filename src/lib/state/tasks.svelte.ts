import {
	addBlocker as addBlockerCommand,
	removeBlocker as removeBlockerCommand,
} from "#lib/remote/blockers.remote.ts";
import {
	addLink as addLinkCommand,
	removeLink as removeLinkCommand,
} from "#lib/remote/links.remote.ts";
import {
	closeTask,
	createTask,
	deleteTask,
	moveTask,
	updateTask,
} from "#lib/remote/tasks.remote.ts";
import type { TaskPatch } from "#lib/tasks/fields.ts";
import type { ClosedReason, Estimate, Priority, Task } from "#lib/types.ts";

export interface NewTaskInput {
	project_id: string;
	title: string;
	description?: string;
	priority?: Priority;
	is_epic?: boolean;
	epic_id?: string | null;
	scope_id?: number | null;
	source_file?: string | null;
	tags?: string[];
	estimate?: Estimate | null;
	assignee?: string | null;
	due_at?: string | null;
}

export function createTaskStore(initial: Task[]) {
	let tasks = $state<Task[]>(initial);
	const epics = $derived(tasks.filter((task) => task.is_epic));

	return {
		get tasks() {
			return tasks;
		},
		get epics() {
			return epics;
		},
		replaceAll(next: Task[]) {
			tasks = next;
		},
		async create(input: NewTaskInput) {
			const task = await createTask(input);
			tasks = [task, ...tasks];
			return task;
		},
		async save(id: string, patch: TaskPatch) {
			const updated = await updateTask({ id, patch });
			tasks = tasks.map((task) => (task.id === updated.id ? updated : task));
			return updated;
		},
		async moveTo(id: string, projectId: string) {
			const moved = await moveTask({ id, project_id: projectId });
			tasks = tasks.map((task) => (task.id === id ? moved : task));
			return moved;
		},
		async close(id: string, reason: ClosedReason) {
			const updated = await closeTask({ id, reason });
			tasks = tasks.map((task) => (task.id === updated.id ? updated : task));
			return updated;
		},
		async destroy(id: string) {
			await deleteTask({ id });
			tasks = tasks
				.filter((task) => task.id !== id)
				.map((task) =>
					task.epic_id === id ? { ...task, epic_id: null } : task,
				);
		},
		async addBlocker(id: string, blockerId: string) {
			const updated = await addBlockerCommand({ id, blocked_by: blockerId });
			tasks = tasks.map((task) => {
				if (task.id === updated.id) return updated;
				if (task.id === blockerId) {
					const blocks = task.blocks ?? [];
					return {
						...task,
						blocks: blocks.includes(updated.id)
							? blocks
							: [...blocks, updated.id].sort(),
					};
				}
				return task;
			});
			return updated;
		},
		async removeBlocker(id: string, blockerId: string) {
			const updated = await removeBlockerCommand({
				id,
				blocked_by: blockerId,
			});
			tasks = tasks.map((task) => {
				if (task.id === updated.id) return updated;
				if (task.id === blockerId) {
					return {
						...task,
						blocks: (task.blocks ?? []).filter((item) => item !== updated.id),
					};
				}
				return task;
			});
			return updated;
		},
		async addLink(
			id: string,
			linkType: "relates_to" | "duplicates",
			targetId: string,
		) {
			const updated = await addLinkCommand({
				id,
				link_type: linkType,
				target: targetId,
			});
			tasks = tasks.map((task) => {
				if (task.id === updated.id) return updated;
				if (task.id !== targetId) return task;
				if (linkType === "relates_to") {
					const relates = task.relates_to ?? [];
					return {
						...task,
						relates_to: relates.includes(updated.id)
							? relates
							: [...relates, updated.id].sort(),
					};
				}
				const by = task.duplicated_by ?? [];
				return {
					...task,
					duplicated_by: by.includes(updated.id)
						? by
						: [...by, updated.id].sort(),
				};
			});
			return updated;
		},
		async removeLink(
			id: string,
			linkType: "relates_to" | "duplicates",
			targetId: string,
		) {
			const updated = await removeLinkCommand({
				id,
				link_type: linkType,
				target: targetId,
			});
			tasks = tasks.map((task) => {
				if (task.id === updated.id) return updated;
				if (task.id !== targetId) return task;
				if (linkType === "relates_to") {
					return {
						...task,
						relates_to: (task.relates_to ?? []).filter(
							(item) => item !== updated.id,
						),
					};
				}
				return {
					...task,
					duplicated_by: (task.duplicated_by ?? []).filter(
						(item) => item !== updated.id,
					),
				};
			});
			return updated;
		},
		clearScope(scopeId: number) {
			tasks = tasks.map((task) =>
				task.scope_id === scopeId ? { ...task, scope_id: null } : task,
			);
		},
		bumpAttachments(id: string, delta: number) {
			tasks = tasks.map((task) =>
				task.id === id
					? {
							...task,
							attachments_count: Math.max(
								0,
								(task.attachments_count ?? 0) + delta,
							),
						}
					: task,
			);
		},
	};
}

export type TaskStore = ReturnType<typeof createTaskStore>;
