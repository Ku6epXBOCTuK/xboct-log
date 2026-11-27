import { SvelteSet } from "svelte/reactivity";
import { fetchFresh } from "#lib/api/fresh.ts";
import {
	addBlocker as addBlockerCommand,
	addLink as addLinkCommand,
	removeBlocker as removeBlockerCommand,
	removeLink as removeLinkCommand,
} from "#lib/api/tasks/links.ts";
import {
	closeTask,
	createTask,
	deleteTask,
	getTasks,
	getTasksByIds,
	moveTask,
	updateTask,
} from "#lib/api/tasks/tasks.ts";
import { data } from "#lib/data/data.svelte.ts";
import type { TaskPatch } from "#lib/tasks/fields/fields.ts";
import { pageCount, TASK_PAGE_SIZE } from "#lib/tasks/query/paging.ts";
import type { TaskQueryArgs } from "#lib/tasks/query/query.ts";
import type {
	ClosedReason,
	Estimate,
	Priority,
	Status,
	Task,
} from "#lib/types.ts";

export interface NewTaskInput {
	project_id: string;
	title: string;
	description?: string;
	status?: Status;
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

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createTaskStore(
	initial: Task[] = [],
	initialTotal = 0,
	onMutate?: () => void,
) {
	const entities = data.entities<Task>("tasks");
	const ids = data.cell<string[]>("tasks:ids", []);
	const totalCell = data.cell("tasks:total", initialTotal);
	const pinnedIds = data.cell<string[]>("tasks:pinned:ids", []);
	let loading = $state(initial.length === 0);
	let error = $state<string | null>(null);
	let absent = $state<Record<string, true>>({});
	let failed = $state<Record<string, true>>({});
	const pending: Record<string, true> = {};
	let lastQuery = $state<TaskQueryArgs | null>(null);

	for (const task of initial) entities.put(task);
	ids.set(initial.map((task) => task.id));

	const tasks = $derived(
		ids.value
			.map((id) => entities.get(id))
			.filter((task): task is Task => task !== undefined),
	);
	const epics = $derived(tasks.filter((task) => task.is_epic));
	const pages = $derived(
		pageCount(totalCell.value, lastQuery?.limit ?? TASK_PAGE_SIZE),
	);

	function byId(id: string): Task | undefined {
		return entities.get(id);
	}

	function isAbsent(id: string): boolean {
		return absent[id] === true;
	}

	function isFailed(id: string): boolean {
		return failed[id] === true;
	}

	function change(targets: string[], update: (task: Task) => Task): void {
		for (const id of targets) {
			const task = byId(id);
			if (task !== undefined) entities.put(update(task));
		}
	}

	function changeAll(update: (task: Task) => Task): void {
		for (const task of entities.all()) entities.put(update(task));
	}

	function replaceAll(next: Task[], nextTotal = next.length): void {
		for (const task of next) entities.put(task);
		ids.set(next.map((task) => task.id));
		totalCell.set(nextTotal);
		const present = new SvelteSet(next.map((task) => task.id));
		pinnedIds.set(pinnedIds.value.filter((id) => !present.has(id)));
		absent = Object.fromEntries(
			Object.entries(absent).filter(([id]) => !present.has(id)),
		);
		failed = {};
	}

	async function load(query: TaskQueryArgs): Promise<void> {
		lastQuery = query;
		loading = true;
		try {
			await data.load(
				"tasks:page",
				() => fetchFresh(getTasks(query)),
				(page) => replaceAll(page.items, page.total),
				true,
			);
			error = null;
		} catch (failure) {
			error = message(failure);
		} finally {
			loading = false;
		}
	}

	async function refresh(): Promise<void> {
		if (lastQuery === null) return;
		await load(lastQuery);
	}

	function keep(next: Task): void {
		entities.put(next);
		if (!ids.value.includes(next.id))
			pinnedIds.set([...pinnedIds.value, next.id]);
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
			for (const item of items) keep(item);
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

	function markAbsent(targets: string[]): void {
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
			return totalCell.value;
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
			entities.put(updated);
			if (updated.closed_epic) entities.put(updated.closed_epic);
			if (updated.reopened_epic) entities.put(updated.reopened_epic);
			onMutate?.();
			return updated;
		},
		async moveTo(id: string, projectId: string) {
			const moved = await moveTask({ task_id: id, project_id: projectId });
			entities.remove(id);
			entities.put(moved);
			ids.set(ids.value.map((item) => (item === id ? moved.id : item)));
			pinnedIds.set(
				pinnedIds.value.map((item) => (item === id ? moved.id : item)),
			);
			onMutate?.();
			return moved;
		},
		async close(id: string, reason: ClosedReason) {
			const updated = await closeTask({ task_id: id, reason });
			entities.put(updated);
			if (updated.closed_epic) entities.put(updated.closed_epic);
			onMutate?.();
			return updated;
		},
		async destroy(id: string) {
			await deleteTask({ task_id: id });
			entities.remove(id);
			ids.set(ids.value.filter((item) => item !== id));
			pinnedIds.set(pinnedIds.value.filter((item) => item !== id));
			changeAll((task) =>
				task.epic_id === id ? { ...task, epic_id: null } : task,
			);
			totalCell.set(Math.max(0, totalCell.value - 1));
			onMutate?.();
		},
		async addBlocker(id: string, blockerId: string) {
			const updated = await addBlockerCommand({
				task_id: id,
				blocked_by: blockerId,
			});
			entities.put(updated);
			change([blockerId], (task) => {
				const blocks = task.blocks ?? [];
				return blocks.includes(updated.id)
					? task
					: { ...task, blocks: [...blocks, updated.id].sort() };
			});
			onMutate?.();
			return updated;
		},
		async removeBlocker(id: string, blockerId: string) {
			const updated = await removeBlockerCommand({
				task_id: id,
				blocked_by: blockerId,
			});
			entities.put(updated);
			change([blockerId], (task) => ({
				...task,
				blocks: (task.blocks ?? []).filter((item) => item !== updated.id),
			}));
			onMutate?.();
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
			entities.put(updated);
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
			onMutate?.();
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
			entities.put(updated);
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
			onMutate?.();
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
