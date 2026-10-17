<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import type { EpicProgress } from "#lib/tasks/filter.ts";
	import type { Scope, Task } from "#lib/types.ts";

	interface Props {
		task: Task;
		scoped: boolean;
		scope: Scope | null;
		isselected: boolean;
		progress: EpicProgress | null;
		onselect: () => void;
		onepic?: (id: string) => void;
	}

	let { task, scoped, scope, isselected, progress, onselect, onepic }: Props =
		$props();

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
		{#if task.is_epic}
			<button
				class="epic-badge epic-marker"
				title="Show tasks of this epic"
				onclick={(event) => filterEpic(event, task.id)}
			>
				EPIC
			</button>
			{#if progress !== null && progress.total > 0}
				<span class="epic-progress">{progress.done}/{progress.total} done</span>
			{/if}
		{:else if task.epic_id !== null}
			<button
				class="epic-badge epic-filter"
				title="Show tasks of this epic"
				onclick={(event) => filterEpic(event, task.epic_id)}
			>
				{task.epic_id}
			</button>
		{/if}
		{#if scoped}
			{#if scope !== null}
				<span class="scope-badge">{scope.name}</span>
			{:else}
				<span class="scope-badge scope-missing">no scope</span>
			{/if}
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
		border: 1px solid color-mix(in oklch, var(--violet) 45%, transparent);
		background: transparent;
		color: var(--violet-ink);
		cursor: pointer;
		font-family: var(--font-mono);
	}

	.epic-filter:hover {
		background: var(--violet-surface);
	}

	.epic-marker {
		border: 0;
		background: var(--violet);
		color: var(--on-violet);
		cursor: pointer;
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.epic-marker:hover {
		background: color-mix(in oklch, var(--violet) 78%, var(--violet-ink));
	}

	.epic-progress {
		margin-left: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.scope-badge {
		margin-left: var(--space-2);
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		line-height: 1.5;
		white-space: nowrap;
	}

	.scope-missing {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
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
		color: var(--priority-critical);
		font-weight: 600;
	}

	.priority-label.high {
		color: var(--priority-high);
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
