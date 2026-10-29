import {
	addBlocker as addBlockerCommand,
	removeBlocker as removeBlockerCommand,
} from "#lib/remote/blockers.remote.ts";
import { fetchFresh } from "#lib/remote/fresh.ts";
import {
	addLink as addLinkCommand,
	removeLink as removeLinkCommand,
} from "#lib/remote/links.remote.ts";
import {
	closeTask,
	createTask,
	deleteTask,
	getTasks,
	getTasksByIds,
	moveTask,
	updateTask,
} from "#lib/remote/tasks.remote.ts";
import type { TaskPatch } from "#lib/tasks/fields.ts";
import { pageCount, TASK_PAGE_SIZE } from "#lib/tasks/paging.ts";
import type { TaskQueryArgs } from "#lib/tasks/query.ts";
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

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createTaskStore(
	initial: Task[] = [],
	initialTotal = 0,
	onMutate?: () => void,
) {
	let tasks = $state<Task[]>(initial);
	let total = $state(initialTotal);
	let loading = $state(initial.length === 0);
	let error = $state<string | null>(null);
	let pinned = $state<Record<string, Task>>({});
	let absent = $state<Record<string, true>>({});
	let failed = $state<Record<string, true>>({});
	const pending: Record<string, true> = {};
	let lastQuery = $state<TaskQueryArgs | null>(null);
	let request = 0;

	const epics = $derived(tasks.filter((task) => task.is_epic));
	const pages = $derived(pageCount(total, lastQuery?.limit ?? TASK_PAGE_SIZE));

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

	function replaceAll(next: Task[], nextTotal = next.length) {
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
	}

	async function load(query: TaskQueryArgs): Promise<void> {
		lastQuery = query;
		const current = ++request;
		loading = true;
		try {
			const page = await fetchFresh(getTasks(query));
			if (current !== request) return;
			replaceAll(page.items, page.total);
			error = null;
		} catch (failure) {
			if (current !== request) return;
			error = message(failure);
		} finally {
			if (current === request) loading = false;
		}
	}

	async function refresh(): Promise<void> {
		if (lastQuery === null) return;
		await load(lastQuery);
	}

	function keep(next: Task) {
		pinned = { ...pinned, [next.id]: next };
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
			const { items, missing } = await getTasksByIds({ task_ids: wanted });
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
		get pages() {
			return pages;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		byId,
		isAbsent,
		isFailed,
		pin,
		load,
		refresh,
		async create(input: NewTaskInput) {
			const task = await createTask(input);
			keep(task);
			await refresh();
			onMutate?.();
			return task;
		},
		async save(id: string, patch: TaskPatch) {
			const updated = await updateTask({ task_id: id, patch });
			put(updated);
			onMutate?.();
			return updated;
		},
		async moveTo(id: string, projectId: string) {
			const moved = await moveTask({ task_id: id, project_id: projectId });
			put(moved);
			onMutate?.();
			return moved;
		},
		async close(id: string, reason: ClosedReason) {
			const updated = await closeTask({ task_id: id, reason });
			put(updated);
			onMutate?.();
			return updated;
		},
		async destroy(id: string) {
			await deleteTask({ task_id: id });
			tasks = tasks
				.filter((task) => task.id !== id)
				.map((task) =>
					task.epic_id === id ? { ...task, epic_id: null } : task,
				);
			total = Math.max(0, total - 1);
			if (pinned[id] !== undefined) {
				const next = { ...pinned };
				delete next[id];
				pinned = next;
			}
			onMutate?.();
		},
		async addBlocker(id: string, blockerId: string) {
			const updated = await addBlockerCommand({
				task_id: id,
				blocked_by: blockerId,
			});
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
				task_id: id,
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
				task_id: id,
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
				task_id: id,
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
