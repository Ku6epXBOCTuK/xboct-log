<script lang="ts">
	import SearchBar from "#lib/components/filters/SearchBar.svelte";
	import Pager from "#lib/components/ui/Pager.svelte";
	import TaskTable from "#lib/components/table/TaskTable.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import { listDeletedTasks, restoreTask } from "#lib/remote/tasks.remote.ts";
	import { reloadApp } from "#lib/reload.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createDebouncedValue } from "#lib/state/debounce.svelte.ts";
	import { createPagedQuery } from "#lib/state/paged.svelte.ts";
	import { formatDateTime, messageOf } from "#lib/tasks/display.ts";
	import {
		defaultOrderFor,
		sortTasks,
		type SortOrder,
		type TaskSortKey,
	} from "#lib/tasks/sort.ts";
	import type { Task } from "#lib/types.ts";
	import ArchiveRestore from "~icons/lucide/archive-restore";
	import Moon from "~icons/lucide/moon";
	import RefreshCw from "~icons/lucide/refresh-cw";
	import Sun from "~icons/lucide/sun";

	const LIMIT = 50;

	const { projects, scopes, filters, theme } = useBoard();

	let error = $state("");
	let busy = $state("");
	let sortKey = $state<TaskSortKey>("updated");
	let sortOrder = $state<SortOrder>("desc");

	const search = createDebouncedValue("");

	const paged = createPagedQuery<Task>((offset) =>
		fetchFresh(
			listDeletedTasks({
				project_id: filters.activeProject ?? undefined,
				q: search.applied === "" ? undefined : search.applied,
				limit: LIMIT,
				offset,
			}),
		),
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
		void paged.load(0);
	});

	$effect(() => {
		return () => search.cancel();
	});

	async function restore(id: string) {
		error = "";
		busy = id;
		try {
			await restoreTask({ id });
			await paged.load(paged.offset);
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
	<header class="page-head">
		<h1>Deleted tasks</h1>
		<span class="muted">
			{activeProjectName ?? "All projects"} · {paged.total} deleted
		</span>
		<div class="head-actions">
			<IconButton
				label={theme.appearance === "light"
					? "Switch to dark theme"
					: "Switch to light theme"}
				size="md"
				onclick={theme.toggle}
			>
				{#if theme.appearance === "light"}
					<Moon />
				{:else}
					<Sun />
				{/if}
			</IconButton>
			<IconButton label="Reload" size="md" onclick={reloadApp}>
				<RefreshCw />
			</IconButton>
		</div>
	</header>

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
		limit={LIMIT}
		total={paged.total}
		emptyLabel="0 tasks"
		onchange={(next) => void paged.load(next)}
	/>
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

	.page-head {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--edge-pad) var(--edge-pad) var(--space-3);
	}

	.head-actions {
		margin-left: auto;
		display: flex;
		gap: var(--space-2);
	}

	.page-head h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
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
