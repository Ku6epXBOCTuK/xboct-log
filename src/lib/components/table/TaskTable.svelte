<script lang="ts">
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import { openBlocked, openBlockers } from "#lib/tasks/blocking.ts";
	import { collectEpicProgress } from "#lib/tasks/filter.ts";
	import type { SortOrder, TaskSortKey } from "#lib/tasks/sort.ts";
	import type { Project, Task } from "#lib/types.ts";
	import type { Snippet } from "svelte";
	import ArrowDown from "~icons/lucide/arrow-down";
	import ArrowUp from "~icons/lucide/arrow-up";
	import ArrowUpDown from "~icons/lucide/arrow-up-down";
	import EmptyState from "./EmptyState.svelte";
	import TaskRow from "./TaskRow.svelte";

	interface Props {
		tasks: Task[];
		allTasks: Task[];
		scopes: ScopeStore;
		projects: Project[];
		showProject: boolean;
		selectedId: string | null;
		total: number;
		sortKey: TaskSortKey;
		sortOrder: SortOrder;
		onclear?: () => void;
		onnew?: () => void;
		onepic?: (id: string) => void;
		onselect?: (id: string) => void;
		onsort: (key: TaskSortKey) => void;
		action?: Snippet<[Task]>;
		empty?: Snippet;
	}

	let {
		tasks,
		allTasks,
		scopes,
		projects,
		showProject,
		selectedId,
		total,
		sortKey,
		sortOrder,
		onclear,
		onnew,
		onepic,
		onselect,
		onsort,
		action,
		empty,
	}: Props = $props();

	const epicProgress = $derived(collectEpicProgress(allTasks));
	const blockers = $derived(
		new Map(allTasks.map((task) => [task.id, openBlockers(allTasks, task)])),
	);
	const blocking = $derived(
		new Map(allTasks.map((task) => [task.id, openBlocked(allTasks, task)])),
	);
	const projectNames = $derived(
		new Map(projects.map((project) => [project.id, project.name])),
	);

	let wrap = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const id = selectedId;
		if (id === null || wrap === null) return;
		wrap
			.querySelector(`[data-task-id="${CSS.escape(id)}"]`)
			?.scrollIntoView({ block: "nearest" });
	});
</script>

{#snippet sortHeader(key: TaskSortKey, label: string, className: string)}
	<th class={className}>
		<button
			class={`sort-button ${sortKey === key ? "active" : ""}`}
			onclick={() => onsort(key)}
			title={`Sort by ${label}`}
		>
			{label}
			{#if sortKey === key}
				{#if sortOrder === "asc"}
					<ArrowUp />
				{:else}
					<ArrowDown />
				{/if}
			{:else}
				<span class="sort-hint"><ArrowUpDown /></span>
			{/if}
		</button>
	</th>
{/snippet}

<div class="table-wrap" bind:this={wrap}>
	<table>
		<thead>
			<tr>
				{@render sortHeader("id", "ID", "id-col")}
				{#if showProject}
					{@render sortHeader(
						"project",
						"Project",
						"project-col optional-column",
					)}
				{/if}
				<th class="scope-col optional-column">Scope</th>
				<th>Task</th>
				<th class="attach-col optional-column">Files</th>
				<th class="tags-col optional-column">Tags</th>
				{@render sortHeader("status", "Status", "status-col")}
				{@render sortHeader(
					"priority",
					"Priority",
					"priority-col optional-column",
				)}
				<th class="est-col optional-column">Est</th>
				{@render sortHeader("created", "Created", "date-col optional-column")}
				<th class="date-col optional-column">Due</th>
				{@render sortHeader("closed", "Closed", "date-col optional-column")}
				{#if action}
					<th class="action-col"></th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each tasks as task (task.id)}
				<TaskRow
					{task}
					scoped={scopes.hasProject(task.project_id)}
					scope={task.scope_id === null
						? null
						: (scopes.all.find((scope) => scope.id === task.scope_id) ?? null)}
					projectName={projectNames.get(task.project_id) ?? task.project_id}
					{showProject}
					isselected={selectedId === task.id}
					progress={epicProgress.get(task.id) ?? null}
					blockers={blockers.get(task.id) ?? []}
					blocking={blocking.get(task.id) ?? []}
					onselect={onselect ? () => onselect(task.id) : undefined}
					{onepic}
					{action}
				/>
			{/each}
		</tbody>
	</table>
	{#if tasks.length === 0}
		{#if empty}
			{@render empty()}
		{:else}
			<EmptyState {total} {onclear} {onnew} />
		{/if}
	{/if}
</div>

<style>
	.table-wrap {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
		min-width: 1280px;
	}

	th {
		color: var(--text-muted);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-align: left;
		font-weight: 600;
		padding: var(--space-3);
		border-bottom: 1px solid var(--border);
		text-transform: uppercase;
		background: var(--surface);
		position: sticky;
		top: 0;
		z-index: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.id-col {
		width: 88px;
		padding-left: var(--edge-pad);
	}

	.project-col {
		width: 110px;
	}

	.scope-col {
		width: 100px;
	}

	.attach-col {
		width: 56px;
	}

	.tags-col {
		width: 180px;
	}

	.status-col {
		width: 118px;
	}

	.priority-col {
		width: 96px;
	}

	.est-col {
		width: 56px;
	}

	.date-col {
		width: 100px;
		padding-right: var(--edge-pad);
	}

	.action-col {
		width: 150px;
		text-align: right;
		white-space: nowrap;
	}

	.sort-button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.sort-button:hover,
	.sort-button.active {
		color: var(--foreground);
	}

	.sort-button :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.sort-hint {
		display: inline-flex;
		opacity: 0.45;
	}

	.sort-button:hover .sort-hint {
		opacity: 1;
	}

	@media (max-width: 1100px) {
		th {
			padding-inline: var(--space-2);
		}

		.id-col {
			padding-left: var(--edge-pad);
		}

		.date-col {
			padding-right: var(--edge-pad);
		}
	}
</style>
