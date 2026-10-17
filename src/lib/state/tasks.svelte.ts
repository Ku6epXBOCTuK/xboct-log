import {
	closeTask,
	createTask,
	deleteTask,
	moveTask,
	updateTask,
} from "#lib/remote/tasks.remote.ts";
import type { TaskPatch } from "#lib/tasks/fields.ts";
import type { ClosedReason, Priority, Task } from "#lib/types.ts";

export interface NewTaskInput {
	project_id: string;
	title: string;
	description?: string;
	priority?: Priority;
	is_epic?: boolean;
	epic_id?: string | null;
	scope_id?: number | null;
	source_file?: string | null;
	source_line?: number | null;
	tags?: string[];
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
			await deleteTask(id);
			tasks = tasks.filter((task) => task.id !== id);
		},
		clearScope(scopeId: number) {
			tasks = tasks.map((task) =>
				task.scope_id === scopeId ? { ...task, scope_id: null } : task,
			);
		},
	};
}

export type TaskStore = ReturnType<typeof createTaskStore>;
