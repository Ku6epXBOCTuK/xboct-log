<script lang="ts">
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import { collectEpicProgress } from "#lib/tasks/filter.ts";
	import type { SortOrder, TaskSortKey } from "#lib/tasks/sort.ts";
	import type { Task } from "#lib/types.ts";
	import ArrowDown from "~icons/lucide/arrow-down";
	import ArrowUp from "~icons/lucide/arrow-up";
	import ArrowUpDown from "~icons/lucide/arrow-up-down";
	import EmptyState from "./EmptyState.svelte";
	import TaskRow from "./TaskRow.svelte";

	interface Props {
		tasks: Task[];
		allTasks: Task[];
		scopes: ScopeStore;
		selectedId: string | null;
		total: number;
		sortKey: TaskSortKey;
		sortOrder: SortOrder;
		onclear?: () => void;
		onnew?: () => void;
		onepic?: (id: string) => void;
		onselect: (id: string) => void;
		onsort: (key: TaskSortKey) => void;
	}

	let {
		tasks,
		allTasks,
		scopes,
		selectedId,
		total,
		sortKey,
		sortOrder,
		onclear,
		onnew,
		onepic,
		onselect,
		onsort,
	}: Props = $props();

	const epicProgress = $derived(collectEpicProgress(allTasks));
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

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				{@render sortHeader("id", "ID", "id-col")}
				<th>Task</th>
				<th class="optional-column">Tags</th>
				{@render sortHeader("status", "Status", "")}
				{@render sortHeader("priority", "Priority", "optional-column")}
				{@render sortHeader("created", "Created", "date-col optional-column")}
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
					isselected={selectedId === task.id}
					progress={epicProgress.get(task.id) ?? null}
					onselect={() => onselect(task.id)}
					{onepic}
				/>
			{/each}
		</tbody>
	</table>
	{#if tasks.length === 0}
		<EmptyState {total} {onclear} {onnew} />
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
		min-width: 780px;
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
	}

	.id-col {
		width: 100px;
		padding-left: var(--edge-pad);
	}

	.date-col {
		padding-right: var(--edge-pad);
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

	:global(.compact-table) table {
		min-width: 0;
	}

	:global(.compact-table) .id-col {
		width: 120px;
	}

	:global(.compact-table) .optional-column {
		display: none;
	}

	:global(.compact-table) th {
		padding-block: var(--space-4);
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
