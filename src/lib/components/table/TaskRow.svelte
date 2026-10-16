<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import type { Task } from "#lib/types.ts";

	interface Props {
		task: Task;
		isselected: boolean;
		onselect: () => void;
		onepic?: (id: string) => void;
	}

	let { task, isselected, onselect, onepic }: Props = $props();

	function filterEpic(event: MouseEvent, epicId: string | null) {
		event.stopPropagation();
		if (epicId !== null) {
			onepic?.(epicId);
		}
	}
</script>

<tr onclick={onselect} class={isselected ? "row-selected" : ""}>
	<td class="task-id">{task.id}</td>
	<td class="task-title">
		{task.title}
		{#if task.epic_id !== null}
			<button
				class="epic-badge epic-filter"
				title="Show tasks of this epic"
				onclick={(event) => filterEpic(event, task.epic_id)}
			>
				{task.epic_id}
			</button>
		{/if}
	</td>
	<td class="optional-column">
		<div class="tag-list">
			{#each task.tags as tag (tag)}
				<span class="tag">
					#{tag}
				</span>
			{/each}
		</div>
	</td>
	<td>
		<span class="status-label">
			<StatusDot status={task.status} />
			{STATUS_LABELS[task.status]}
		</span>
	</td>
	<td class={`priority-label ${task.priority} optional-column`}>
		{task.priority}
	</td>
	<td class="date-label optional-column">
		{formatDate(task.created_at)}
	</td>
</tr>

<style>
	td {
		padding: var(--space-3);
		border-bottom: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: var(--text-md);
		vertical-align: middle;
	}

	tr {
		cursor: pointer;
	}

	tr:not(.row-selected):hover td {
		background: var(--hover);
	}

	.row-selected td {
		background: var(--violet-row);
	}

	.task-id {
		padding-left: var(--space-6);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.task-title {
		color: var(--foreground);
		min-width: 300px;
	}

	.epic-filter {
		border: 0;
		cursor: pointer;
		font-family: var(--font-mono);
	}

	.epic-filter:hover {
		background: color-mix(in oklch, var(--violet) 32%, var(--violet-surface));
	}

	.tag-list {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}

	.tag {
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		line-height: 1.5;
	}

	.status-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.priority-label {
		text-transform: lowercase;
		color: var(--text-secondary);
	}

	.priority-label.critical {
		color: var(--accent-ink);
		font-weight: 600;
	}

	.date-label {
		color: var(--text-muted);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	:global(.compact-table) .optional-column {
		display: none;
	}

	:global(.compact-table) .task-title {
		min-width: 0;
	}

	:global(.compact-table) td {
		padding-block: var(--space-4);
	}

	@media (max-width: 1100px) {
		td {
			padding-inline: var(--space-2);
		}

		.task-id {
			padding-left: var(--space-4);
		}
	}
</style>
