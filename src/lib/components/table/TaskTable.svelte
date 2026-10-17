<script lang="ts">
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import EmptyState from "./EmptyState.svelte";
	import TaskRow from "./TaskRow.svelte";

	interface Props {
		tasks: Task[];
		scopes: ScopeStore;
		selectedId: string | null;
		total: number;
		onclear?: () => void;
		onnew?: () => void;
		onepic?: (id: string) => void;
		onselect: (id: string) => void;
	}

	let {
		tasks,
		scopes,
		selectedId,
		total,
		onclear,
		onnew,
		onepic,
		onselect,
	}: Props = $props();
</script>

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				<th class="id-col">ID</th>
				<th>Task</th>
				<th class="optional-column">Tags</th>
				<th>Status</th>
				<th class="optional-column">Priority</th>
				<th class="date-col optional-column">Created</th>
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
