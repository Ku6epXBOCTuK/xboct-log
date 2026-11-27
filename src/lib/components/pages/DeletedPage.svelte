<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import { fetchFresh } from "#lib/api/fresh.ts";
	import { listDeletedTasks, restoreTask } from "#lib/api/tasks/tasks.ts";
	import DeletedAttachments from "#lib/components/attachments/DeletedAttachments.svelte";
	import SearchBar from "#lib/components/filters/SearchBar.svelte";
	import AppBar from "#lib/components/layout/AppBar.svelte";
	import TaskTable from "#lib/components/table/TaskTable.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import Pager from "#lib/components/ui/Pager.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createDebouncedValue } from "#lib/state/ui/debounce.svelte.ts";
	import { createPagedQuery } from "#lib/state/ui/paged.svelte.ts";
	import {
		formatDateTime,
		messageOf,
	} from "#lib/tasks/presentation/display.ts";
	import {
		defaultOrderFor,
		type SortOrder,
		sortTasks,
		type TaskSortKey,
	} from "#lib/tasks/query/sort.ts";
	import type { Task } from "#lib/types.ts";
	import ArchiveRestore from "~icons/lucide/archive-restore";

	const LIMIT = 50;

	const { projects, scopes, filters, fresh } = useBoard();

	let error = $state("");
	let busy = $state("");
	let tab = $state<"tasks" | "attachments">("tasks");
	let sortKey = $state<TaskSortKey>("updated");
	let sortOrder = $state<SortOrder>("desc");

	const search = createDebouncedValue("");

	const paged = createPagedQuery<Task>(
		"deleted-tasks",
		(page) =>
			fetchFresh(
				listDeletedTasks({
					project_id: filters.activeProject ?? undefined,
					q: search.applied === "" ? undefined : search.applied,
					page,
				}),
			),
		LIMIT,
	);

	const projectNames = $derived(
		new Map(projects.all.map((project) => [project.id, project.name])),
	);

	const activeProjectName = $derived(
		projects.all.find((project) => project.id === filters.activeProject)?.name,
	);

	const visible = $derived(
		sortTasks(paged.items, sortKey, sortOrder, { projectNames }),
	);

	$effect(() => {
		void paged.load(1);
	});

	$effect(() => fresh.register("tasks", () => paged.load(paged.cursor)));

	$effect(() => {
		return () => search.cancel();
	});

	async function restore(id: string) {
		error = "";
		busy = id;
		try {
			await restoreTask({ task_id: id });
			await paged.load(paged.cursor);
		} catch (cause) {
			error = messageOf(cause);
		} finally {
			busy = "";
		}
	}

	function sortBy(key: TaskSortKey) {
		if (sortKey === key) {
			sortOrder = sortOrder === "asc" ? "desc" : "asc";
			return;
		}
		sortKey = key;
		sortOrder = defaultOrderFor(key);
	}
</script>

{#snippet restoreAction(task: Task)}
	<span class="deleted-at">
		{task.deleted_at ? formatDateTime(task.deleted_at) : ""}
	</span>
	<IconButton
		label="Restore task"
		title="Restore task"
		disabled={busy === task.id}
		onclick={() => void restore(task.id)}
	>
		<ArchiveRestore />
	</IconButton>
{/snippet}

{#snippet emptyState()}
	<p class="empty">No deleted tasks</p>
{/snippet}

<section class="deleted-page">
	<AppBar>
		{#snippet leading()}
			<h1>{tab === "tasks" ? "Deleted tasks" : "Deleted attachments"}</h1>
			<span class="muted">
				{tab === "tasks"
					? `${activeProjectName ?? "All projects"} · ${paged.total} deleted`
					: "Kept for 30 days, then removed"}
			</span>
		{/snippet}
	</AppBar>

	<nav class="tabs">
		<button
			type="button"
			class:active={tab === "tasks"}
			onclick={() => (tab = "tasks")}
		>
			Tasks
		</button>
		<button
			type="button"
			class:active={tab === "attachments"}
			onclick={() => (tab = "attachments")}
		>
			Attachments
		</button>
	</nav>

	{#if tab === "attachments"}
		<DeletedAttachments />
	{:else}
		<div class="filters">
			<SearchBar value={search.value} oninput={(value) => search.set(value)} />
		</div>

		{#if error !== ""}
			<div class="error-wrap">
				<ErrorNote message={error} />
			</div>
		{/if}

		{#if paged.failed}
			<p class="empty">Deleted tasks are unavailable</p>
		{:else if !paged.loaded}
			<p class="empty">Loading…</p>
		{:else}
			<TaskTable
				tasks={visible}
				allTasks={paged.items}
				{scopes}
				projects={projects.all}
				showProject={filters.activeProject === null}
				selectedId={null}
				{sortKey}
				{sortOrder}
				onsort={sortBy}
				total={paged.total}
				action={restoreAction}
				empty={emptyState}
			/>
		{/if}

		<Pager
			offset={paged.offset}
			size={paged.size}
			pageSize={paged.pageSize}
			total={paged.total}
			emptyLabel="0 tasks"
			onchange={(next) =>
				void paged.load(Math.floor(next / paged.pageSize) + 1)}
		/>
	{/if}
</section>

<style>
	.deleted-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--background);
	}

	.tabs {
		flex: none;
		display: flex;
		gap: var(--space-1);
		padding: 0 var(--edge-pad) var(--space-3);
	}

	.tabs button {
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.tabs button:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	.tabs button.active {
		color: var(--foreground);
		border-color: var(--border);
		background: var(--surface);
	}

	.filters {
		flex: none;
		padding: 0 var(--edge-pad) var(--space-4);
	}

	.error-wrap {
		margin: 0 var(--edge-pad) var(--space-3);
	}

	.deleted-at {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.empty {
		margin: 0;
		padding: var(--space-8) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
