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
	getTasksByIds,
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

function ids(tasks: Task[]): Set<string> {
	return new Set(tasks.map((task) => task.id));
}

export function createTaskStore(
	initial: Task[],
	initialTotal = initial.length,
) {
	let tasks = $state<Task[]>(initial);
	let total = $state(initialTotal);
	let pinned = $state<Record<string, Task>>({});
	let absent = $state<Record<string, true>>({});
	let failed = $state<Record<string, true>>({});
	const pending: Record<string, true> = {};

	const epics = $derived(tasks.filter((task) => task.is_epic));
	const truncated = $derived(total > tasks.length);

	function byId(id: string): Task | undefined {
		return tasks.find((task) => task.id === id) ?? pinned[id];
	}

	function isAbsent(id: string): boolean {
		return absent[id] === true;
	}

	function isFailed(id: string): boolean {
		return failed[id] === true;
	}

	function put(next: Task) {
		if (pinned[next.id] !== undefined) {
			pinned = { ...pinned, [next.id]: next };
			return;
		}
		tasks = tasks.map((task) => (task.id === next.id ? next : task));
	}

	function change(targets: string[], update: (task: Task) => Task) {
		for (const id of targets) {
			const task = byId(id);
			if (task !== undefined) {
				put(update(task));
			}
		}
	}

	function changeAll(update: (task: Task) => Task) {
		tasks = tasks.map(update);
		pinned = Object.fromEntries(
			Object.values(pinned).map((task) => [task.id, update(task)]),
		);
	}

	async function pin(targets: string[]): Promise<void> {
		const wanted = targets.filter(
			(id) =>
				byId(id) === undefined &&
				!isAbsent(id) &&
				!isFailed(id) &&
				pending[id] !== true,
		);
		if (wanted.length === 0) return;
		for (const id of wanted) {
			pending[id] = true;
		}
		try {
			const { items, missing } = await getTasksByIds({ ids: wanted });
			const loaded = items.filter((task) => !ids(tasks).has(task.id));
			if (loaded.length > 0) {
				pinned = {
					...pinned,
					...Object.fromEntries(loaded.map((task) => [task.id, task])),
				};
			}
			markAbsent(missing);
		} catch {
			const next = { ...failed };
			for (const id of wanted) {
				next[id] = true;
			}
			failed = next;
		} finally {
			for (const id of wanted) {
				delete pending[id];
			}
		}
	}

	function markAbsent(targets: string[]) {
		if (targets.length === 0) return;
		absent = {
			...absent,
			...Object.fromEntries(targets.map((id) => [id, true as const])),
		};
		failed = Object.fromEntries(
			Object.entries(failed).filter(([id]) => !targets.includes(id)),
		);
	}

	return {
		get tasks() {
			return tasks;
		},
		get epics() {
			return epics;
		},
		get total() {
			return total;
		},
		get truncated() {
			return truncated;
		},
		byId,
		isAbsent,
		isFailed,
		pin,
		replaceAll(next: Task[], nextTotal = next.length) {
			tasks = next;
			total = nextTotal;
			const present = ids(next);
			pinned = Object.fromEntries(
				Object.entries(pinned).filter(([id]) => !present.has(id)),
			);
			absent = Object.fromEntries(
				Object.entries(absent).filter(([id]) => !present.has(id)),
			);
			failed = {};
		},
		async create(input: NewTaskInput) {
			const task = await createTask(input);
			tasks = [task, ...tasks];
			total += 1;
			return task;
		},
		async save(id: string, patch: TaskPatch) {
			const updated = await updateTask({ id, patch });
			put(updated);
			return updated;
		},
		async moveTo(id: string, projectId: string) {
			const moved = await moveTask({ id, project_id: projectId });
			put(moved);
			return moved;
		},
		async close(id: string, reason: ClosedReason) {
			const updated = await closeTask({ id, reason });
			put(updated);
			return updated;
		},
		async destroy(id: string) {
			await deleteTask({ id });
			tasks = tasks
				.filter((task) => task.id !== id)
				.map((task) =>
					task.epic_id === id ? { ...task, epic_id: null } : task,
				);
			total = Math.max(tasks.length, total - 1);
			if (pinned[id] !== undefined) {
				const next = { ...pinned };
				delete next[id];
				pinned = next;
			}
		},
		async addBlocker(id: string, blockerId: string) {
			const updated = await addBlockerCommand({ id, blocked_by: blockerId });
			put(updated);
			change([blockerId], (task) => {
				const blocks = task.blocks ?? [];
				return blocks.includes(updated.id)
					? task
					: { ...task, blocks: [...blocks, updated.id].sort() };
			});
			return updated;
		},
		async removeBlocker(id: string, blockerId: string) {
			const updated = await removeBlockerCommand({
				id,
				blocked_by: blockerId,
			});
			put(updated);
			change([blockerId], (task) => ({
				...task,
				blocks: (task.blocks ?? []).filter((item) => item !== updated.id),
			}));
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
			put(updated);
			change([targetId], (task) => {
				if (linkType === "relates_to") {
					const relates = task.relates_to ?? [];
					return relates.includes(updated.id)
						? task
						: { ...task, relates_to: [...relates, updated.id].sort() };
				}
				const by = task.duplicated_by ?? [];
				return by.includes(updated.id)
					? task
					: { ...task, duplicated_by: [...by, updated.id].sort() };
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
			put(updated);
			change([targetId], (task) => {
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
			changeAll((task) =>
				task.scope_id === scopeId ? { ...task, scope_id: null } : task,
			);
		},
		bumpAttachments(id: string, delta: number) {
			change([id], (task) => ({
				...task,
				attachments_count: Math.max(0, (task.attachments_count ?? 0) + delta),
			}));
		},
	};
}

export type TaskStore = ReturnType<typeof createTaskStore>;
